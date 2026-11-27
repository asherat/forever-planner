import base64
import csv
import io
import json
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REGION = "eu"
API_HOST = f"https://{REGION}.api.blizzard.com"
STATIC_NAMESPACE = f"static-forever-{REGION}"
LOCALE = "en_GB"
MAX_REQUIRED_LEVEL = 60
WORKER_COUNT = 8
ESTIMATED_LEVEL_OFFSET = 5

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "cache"
OUTPUT_DIR = ROOT / "web" / "data"
CREDENTIALS_FILE = Path.home() / ".config" / "blizzard-api.env"
WAGO_HOST = "https://wago.tools"
WAGO_PRODUCT = "wowf"
WAGO_USER_AGENT = "forever-planner-data-builder"
CONTINENT_MAP_TYPE = "2"
ZONE_MAP_TYPES = {"3", "4"}
TEACHING_ITEM_PREFIXES = ["Pattern: ", "Plans: ", "Formula: ", "Recipe: ", "Schematic: ", "Design: ", "Manual: "]

EQUIPPABLE_ITEM_CLASSES = {"Armor", "Weapon"}
EXCLUDED_QUALITIES = {"POOR"}
EXCLUDED_NAME_PATTERN = re.compile(r"^\[TMP\]|\bTEST\b|^QA|\[PH\]|Monster -|^Deprecated", re.IGNORECASE)
ICON_FILE_PATTERN = re.compile(r"/icons/\d+/(\d+)\.jpg$")
FERAL_ATTACK_POWER_PATTERN = re.compile(r"\+(\d+) Attack Power in Cat, Bear, and Dire Bear forms only")
BONUS_TYPE_STAT = "2"
BONUS_TYPE_NAME_SUFFIX = "5"
QUALITY_BUDGET_COLUMNS = {"2": "Good", "3": "Superior", "4": "Epic"}
INVENTORY_TYPE_BUDGET_INDEX = {
    "1": 0, "5": 0, "7": 0, "17": 0, "20": 0,
    "3": 1, "6": 1, "8": 1, "10": 1, "12": 1,
    "2": 2, "9": 2, "11": 2, "14": 2, "16": 2, "23": 2,
    "13": 3, "21": 3, "22": 3,
    "15": 4, "25": 4, "26": 4, "28": 4,
}
GAME_STAT_NAMES = {
    "3": "AGILITY", "4": "STRENGTH", "5": "INTELLECT", "6": "SPIRIT", "7": "STAMINA",
    "12": "DEFENSE_SKILL_RATING", "13": "DODGE_RATING", "14": "PARRY_RATING", "15": "BLOCK_RATING",
    "31": "HIT_RATING", "32": "CRIT_RATING", "38": "ATTACK_POWER", "39": "RANGED_ATTACK_POWER",
    "41": "SPELL_HEALING_DONE", "42": "SPELL_DAMAGE_DONE", "43": "MANA_REGENERATION", "45": "SPELL_POWER",
    "46": "HEALTH_REGEN", "47": "SPELL_PENETRATION", "48": "BLOCK_VALUE", "50": "EXTRA_ARMOR",
    "51": "FIRE_RESISTANCE", "52": "FROST_RESISTANCE", "54": "SHADOW_RESISTANCE", "55": "NATURE_RESISTANCE",
    "56": "ARCANE_RESISTANCE", "84": "BONUS_STAT_HOLY_DAMAGE_DONE", "85": "BONUS_STAT_FIRE_DAMAGE_DONE",
    "86": "BONUS_STAT_NATURE_DAMAGE_DONE", "87": "BONUS_STAT_FROST_DAMAGE_DONE",
    "88": "BONUS_STAT_SHADOW_DAMAGE_DONE", "89": "BONUS_STAT_ARCANE_DAMAGE_DONE",
}

token_lock = threading.Lock()
access_token = None


def read_credentials():
    credentials = {}
    for line in CREDENTIALS_FILE.read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            credentials[key.strip()] = value.strip()
    return credentials["BLIZZARD_CLIENT_ID"], credentials["BLIZZARD_CLIENT_SECRET"]


def fetch_access_token():
    client_id, client_secret = read_credentials()
    request = urllib.request.Request(
        "https://oauth.battle.net/token",
        data=b"grant_type=client_credentials",
        method="POST",
    )
    basic_credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request.add_header("Authorization", f"Basic {basic_credentials}")
    with urllib.request.urlopen(request) as response:
        return json.load(response)["access_token"]


def get_access_token():
    global access_token
    with token_lock:
        if access_token is None:
            access_token = fetch_access_token()
        return access_token


def api_get(path, parameters=None):
    query = {"namespace": STATIC_NAMESPACE, "locale": LOCALE}
    if parameters is not None:
        query.update(parameters)
    url = f"{API_HOST}{path}?{urllib.parse.urlencode(query)}"
    for attempt in range(5):
        request = urllib.request.Request(url)
        request.add_header("Authorization", f"Bearer {get_access_token()}")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code in (429, 500, 502, 503, 504):
                time.sleep(1 + attempt * 2)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(1 + attempt * 2)
    raise RuntimeError(f"Giving up on {url}")


def cached_get(cache_key, path, parameters=None):
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    payload = api_get(path, parameters)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(payload))
    return payload


def fetch_one(cache_prefix, path_template, identifier):
    return identifier, cached_get(f"{cache_prefix}/{identifier}", path_template.format(identifier))


def fetch_many(cache_prefix, path_template, identifiers, label):
    results = {}
    identifier_list = sorted(set(identifiers))
    print(f"{label}: fetching {len(identifier_list)}", file=sys.stderr)
    prefixes = [cache_prefix] * len(identifier_list)
    templates = [path_template] * len(identifier_list)
    with ThreadPoolExecutor(max_workers=WORKER_COUNT) as executor:
        for identifier, payload in executor.map(fetch_one, prefixes, templates, identifier_list):
            if payload is not None:
                results[identifier] = payload
    return results


def search_equippable_item_ids():
    item_ids = set()
    for required_level in range(0, MAX_REQUIRED_LEVEL + 1):
        page = 1
        while True:
            payload = cached_get(
                f"search/level-{required_level}-page-{page}",
                "/data/wow/search/item",
                {"required_level": required_level, "orderby": "id", "_pageSize": 1000, "_page": page},
            )
            for result in payload.get("results", []):
                data = result["data"]
                if not data.get("is_equippable"):
                    continue
                if data["item_class"]["name"][LOCALE] not in EQUIPPABLE_ITEM_CLASSES:
                    continue
                if data["quality"]["type"] in EXCLUDED_QUALITIES:
                    continue
                item_ids.add(data["id"])
            if page >= payload.get("pageCount", 0):
                break
            page += 1
    return item_ids


def reputation_factions(items):
    reputation_ids = set()
    for item in items.values():
        requirements = item.get("preview_item", {}).get("requirements", {})
        if "reputation" in requirements:
            reputation_ids.add(requirements["reputation"]["faction"]["id"])
    reputations = fetch_many("reputation-faction", "/data/wow/reputation-faction/{}", reputation_ids, "reputations")
    factions = {}
    for reputation_id, reputation in reputations.items():
        if "player_faction" in reputation:
            factions[reputation_id] = reputation["player_faction"]["type"]
    return factions


def item_faction(item, item_sources, factions_by_reputation):
    requirements = item.get("preview_item", {}).get("requirements", {})
    if "reputation" in requirements:
        reputation_faction = factions_by_reputation.get(requirements["reputation"]["faction"]["id"])
        if reputation_faction is not None:
            return reputation_faction
    if not item_sources:
        return None
    sides = set()
    for source in item_sources:
        if source["type"] != "quest":
            return None
        sides.add(source.get("faction"))
    if len(sides) == 1:
        return sides.pop()
    return None


def item_icons(items):
    media = fetch_many("item-media", "/data/wow/media/item/{}", items.keys(), "item icons")
    icons = {}
    for item_id, payload in media.items():
        for asset in payload.get("assets", []):
            if asset.get("key") == "icon":
                match = ICON_FILE_PATTERN.search(asset.get("value", ""))
                if match is not None:
                    icons[item_id] = int(match.group(1))
    return icons


def compact_item(item):
    preview = item.get("preview_item", {})
    stats = {}
    for stat in preview.get("stats") or []:
        if "type" in stat:
            stats[stat["type"]["type"]] = stat["value"]
    equip_effects = []
    for spell in preview.get("spells") or []:
        description = spell.get("description", "")
        if description:
            equip_effects.append(description)
        feral_match = FERAL_ATTACK_POWER_PATTERN.search(description)
        if feral_match is not None:
            stats["FERAL_ATTACK_POWER"] = stats.get("FERAL_ATTACK_POWER", 0) + int(feral_match.group(1))
    requirements = preview.get("requirements", {})
    playable_classes = []
    if "playable_classes" in requirements:
        for playable_class in requirements["playable_classes"].get("links", []):
            playable_classes.append(playable_class["name"])
    weapon = None
    if "weapon" in preview:
        weapon_data = preview["weapon"]
        weapon = {
            "minimumDamage": weapon_data["damage"]["min_value"],
            "maximumDamage": weapon_data["damage"]["max_value"],
            "speed": weapon_data.get("attack_speed", {}).get("value", 0) / 1000,
            "damagePerSecond": weapon_data.get("dps", {}).get("value", 0),
        }
    record = {
        "id": item["id"],
        "name": item["name"],
        "quality": item["quality"]["type"],
        "slot": item["inventory_type"]["type"],
        "itemClass": item["item_class"]["name"],
        "itemSubclass": item["item_subclass"]["name"],
        "itemLevel": item.get("level", 0),
        "requiredLevel": item.get("required_level", 0),
        "binding": preview.get("binding", {}).get("type", ""),
        "armor": preview.get("armor", {}).get("value", 0),
        "stats": stats,
        "effects": equip_effects,
    }
    if record["requiredLevel"] > 0:
        record["usableLevel"] = record["requiredLevel"]
    else:
        record["usableLevel"] = min(MAX_REQUIRED_LEVEL, max(1, record["itemLevel"] - ESTIMATED_LEVEL_OFFSET))
        record["levelEstimated"] = True
    if weapon is not None:
        record["weapon"] = weapon
    if playable_classes:
        record["classes"] = playable_classes
    if "reputation" in requirements:
        record["reputation"] = requirements["reputation"].get("display_string", "")
        record["reputationRequirement"] = {
            "factionId": requirements["reputation"]["faction"]["id"],
            "tier": requirements["reputation"].get("min_reputation_level", 0),
        }
    if "skill" in requirements:
        record["skill"] = requirements["skill"].get("display_string", "")
    return record


def collect_reward_item_ids(rewards):
    item_ids = []
    if isinstance(rewards, dict):
        if "item" in rewards and isinstance(rewards["item"], dict) and "id" in rewards["item"]:
            item_ids.append(rewards["item"]["id"])
        for value in rewards.values():
            item_ids.extend(collect_reward_item_ids(value))
    elif isinstance(rewards, list):
        for value in rewards:
            item_ids.extend(collect_reward_item_ids(value))
    return item_ids


def race_factions(quests):
    race_ids = set()
    for quest in quests.values():
        for race in (quest.get("requirements") or {}).get("races", []):
            race_ids.add(race["id"])
    races = fetch_many("playable-race", "/data/wow/playable-race/{}", race_ids, "races")
    factions = {}
    for race_id, race in races.items():
        factions[race_id] = race.get("faction", {}).get("type")
    return factions


def quest_faction(quest, factions_by_race):
    requirements = quest.get("requirements") or {}
    if "faction" in requirements:
        return requirements["faction"]["type"]
    race_sides = set()
    for race in requirements.get("races", []):
        race_sides.add(factions_by_race.get(race["id"]))
    if len(race_sides) == 1:
        return race_sides.pop()
    return None


def build_quest_sources():
    area_index = cached_get("quest-area-index", "/data/wow/quest/area/index")
    category_index = cached_get("quest-category-index", "/data/wow/quest/category/index")
    containers = []
    for area in area_index.get("areas", []):
        containers.append(("area", area["id"], area["name"]))
    for category in category_index.get("categories", []):
        containers.append(("category", category["id"], category["name"]))

    quest_zone = {}
    for container_type, container_id, container_name in containers:
        payload = cached_get(f"quest-{container_type}/{container_id}", f"/data/wow/quest/{container_type}/{container_id}")
        if payload is None:
            continue
        for quest in payload.get("quests", []):
            quest_zone.setdefault(quest["id"], container_name)

    quests = fetch_many("quest", "/data/wow/quest/{}", quest_zone.keys(), "quests")
    factions_by_race = race_factions(quests)
    sources = {}
    for quest_id, quest in quests.items():
        reward_item_ids = sorted(set(collect_reward_item_ids(quest.get("rewards", {}))))
        zone = quest.get("area", {}).get("name") or quest_zone.get(quest_id, "")
        faction = quest_faction(quest, factions_by_race)
        source = {
            "type": "quest",
            "questId": quest_id,
            "quest": quest.get("title", ""),
            "zone": zone,
        }
        if faction is not None:
            source["faction"] = faction
        for item_id in reward_item_ids:
            sources.setdefault(item_id, []).append(source)
    return sources


def build_crafting_sources():
    profession_index = cached_get("profession-index", "/data/wow/profession/index")
    recipe_profession = {}
    for profession in profession_index.get("professions", []):
        profession_detail = cached_get(f"profession/{profession['id']}", f"/data/wow/profession/{profession['id']}")
        if profession_detail is None:
            continue
        for tier in profession_detail.get("skill_tiers", []):
            tier_detail = cached_get(
                f"profession-tier/{profession['id']}-{tier['id']}",
                f"/data/wow/profession/{profession['id']}/skill-tier/{tier['id']}",
            )
            if tier_detail is None:
                continue
            for category in tier_detail.get("categories", []):
                for recipe in category.get("recipes", []):
                    recipe_profession[recipe["id"]] = profession["name"]

    recipes = fetch_many("recipe", "/data/wow/recipe/{}", recipe_profession.keys(), "recipes")
    sources = {}
    for recipe_id, recipe in recipes.items():
        reagents = []
        for reagent in recipe.get("reagents", []):
            reagents.append({
                "id": reagent["reagent"]["id"],
                "name": reagent["reagent"]["name"],
                "quantity": reagent["quantity"],
            })
        for crafted_key in ("crafted_item", "alliance_crafted_item", "horde_crafted_item"):
            crafted_item = recipe.get(crafted_key)
            if crafted_item is None:
                continue
            sources.setdefault(crafted_item["id"], []).append({
                "type": "craft",
                "recipeId": recipe_id,
                "profession": recipe_profession[recipe_id],
                "recipe": recipe.get("name", ""),
                "reagents": reagents,
            })
    return sources


def record_id(record):
    return record["id"]


def build_recipe_list():
    profession_index = cached_get("profession-index", "/data/wow/profession/index")
    recipes = []
    for profession in profession_index.get("professions", []):
        profession_detail = cached_get(f"profession/{profession['id']}", f"/data/wow/profession/{profession['id']}")
        if profession_detail is None:
            continue
        for tier in profession_detail.get("skill_tiers", []):
            tier_detail = cached_get(
                f"profession-tier/{profession['id']}-{tier['id']}",
                f"/data/wow/profession/{profession['id']}/skill-tier/{tier['id']}",
            )
            if tier_detail is None:
                continue
            for category in tier_detail.get("categories", []):
                for recipe_reference in category.get("recipes", []):
                    recipe = cached_get(f"recipe/{recipe_reference['id']}", f"/data/wow/recipe/{recipe_reference['id']}")
                    if recipe is None:
                        continue
                    crafted_item = recipe.get("crafted_item") or recipe.get("horde_crafted_item") or recipe.get("alliance_crafted_item")
                    if crafted_item is None or not recipe.get("reagents"):
                        continue
                    reagents = []
                    for reagent in recipe["reagents"]:
                        reagents.append([reagent["reagent"]["id"], reagent["quantity"]])
                    recipes.append({
                        "id": recipe["id"],
                        "name": recipe.get("name", ""),
                        "profession": profession["name"],
                        "itemId": crafted_item["id"],
                        "quantity": max(1, int(recipe.get("crafted_quantity", {}).get("value", 1))),
                        "reagents": reagents,
                    })
    return recipes


def teaching_items():
    by_name = {}
    for prefix in TEACHING_ITEM_PREFIXES:
        payload = cached_get(
            "teaching-" + prefix.strip(" :").lower(),
            "/data/wow/search/item",
            {"name.en_GB": prefix.strip(), "orderby": "id", "_pageSize": 1000},
        )
        for result in payload.get("results", []):
            name = result["data"]["name"][LOCALE]
            if name.startswith(prefix):
                by_name.setdefault(name[len(prefix):], result["data"]["id"])
    return by_name


def add_teaching_items(recipes):
    by_name = teaching_items()
    for recipe in recipes:
        teaching_item_id = by_name.get(recipe.pop("name"))
        if teaching_item_id is not None:
            recipe["teachingItemId"] = teaching_item_id


def build_crafting_items(recipes):
    item_ids = set()
    for recipe in recipes:
        item_ids.add(recipe["itemId"])
        if "teachingItemId" in recipe:
            item_ids.add(recipe["teachingItemId"])
        for reagent_id, quantity in recipe["reagents"]:
            item_ids.add(reagent_id)
    items = fetch_many("item", "/data/wow/item/{}", item_ids, "crafting items")
    icons = item_icons(items)
    crafting_items = {}
    for item_id, item in items.items():
        record = {
            "name": item["name"],
            "quality": item["quality"]["type"],
            "vendorPrice": item.get("purchase_price", 0),
        }
        if item.get("preview_item", {}).get("binding", {}).get("type") == "ON_ACQUIRE":
            record["bindOnPickup"] = True
        if item_id in icons:
            record["icon"] = icons[item_id]
        crafting_items[item_id] = record
    return crafting_items


def merge_sources(*source_maps):
    merged = {}
    for source_map in source_maps:
        for item_id, entries in source_map.items():
            merged.setdefault(item_id, []).extend(entries)
    return merged


def reputation_names():
    index = cached_get("reputation-faction-index", "/data/wow/reputation-faction/index")
    faction_ids = []
    for faction in index.get("factions", []):
        faction_ids.append(faction["id"])
    details = fetch_many("reputation-faction", "/data/wow/reputation-faction/{}", faction_ids, "reputations")
    names = {}
    for faction_id, faction in details.items():
        side = None
        if "player_faction" in faction:
            side = faction["player_faction"]["type"]
        names[faction["name"]] = {"id": faction_id, "side": side}
    return names


def wago_table(table_name):
    cache_file = CACHE_DIR / "wago" / f"{table_name}.csv"
    if not cache_file.exists():
        builds_request = urllib.request.Request(f"{WAGO_HOST}/api/builds", headers={"User-Agent": WAGO_USER_AGENT})
        with urllib.request.urlopen(builds_request, timeout=30) as response:
            build = json.load(response)[WAGO_PRODUCT][0]["version"]
        table_request = urllib.request.Request(f"{WAGO_HOST}/db2/{table_name}/csv?build={build}", headers={"User-Agent": WAGO_USER_AGENT})
        with urllib.request.urlopen(table_request, timeout=60) as response:
            text = response.read().decode("utf-8")
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(text)
    return list(csv.DictReader(io.StringIO(cache_file.read_text())))


def map_region(assignment):
    return {
        "minX": float(assignment["Region_0"]),
        "minY": float(assignment["Region_1"]),
        "maxX": float(assignment["Region_3"]),
        "maxY": float(assignment["Region_4"]),
    }


def relative_rectangle(region, container):
    width = container["maxY"] - container["minY"]
    height = container["maxX"] - container["minX"]
    return [
        round((container["maxY"] - region["maxY"]) / width, 5),
        round((container["maxX"] - region["maxX"]) / height, 5),
        round((container["maxY"] - region["minY"]) / width, 5),
        round((container["maxX"] - region["minX"]) / height, 5),
    ]


def build_maps():
    ui_maps = {}
    for row in wago_table("UiMap"):
        ui_maps[row["ID"]] = row
    regions = {}
    for row in wago_table("UiMapAssignment"):
        if row["OrderIndex"] == "0" and row["UiMapID"] not in regions:
            regions[row["UiMapID"]] = map_region(row)
    continents = {}
    zones = {}
    for map_id, ui_map in ui_maps.items():
        if ui_map["Type"] != CONTINENT_MAP_TYPE or map_id not in regions:
            continue
        has_zones = False
        for child_id, child in ui_maps.items():
            if child["ParentUiMapID"] != map_id or child["Type"] not in ZONE_MAP_TYPES or child_id not in regions:
                continue
            has_zones = True
            zones[child["Name_lang"]] = {
                "continent": ui_map["Name_lang"],
                "uiMapId": int(child_id),
                "rectangle": relative_rectangle(regions[child_id], regions[map_id]),
            }
        if has_zones:
            region = regions[map_id]
            continents[ui_map["Name_lang"]] = {
                "uiMapId": int(map_id),
                "aspectRatio": round((region["maxY"] - region["minY"]) / (region["maxX"] - region["minX"]), 4),
            }
    return {"continents": continents, "zones": zones}


def suffix_stat_value(budget, allocation):
    return int(budget * int(allocation) / 10000 + 0.5)


def random_suffix(bonus_rows, suffix_names, budget):
    name = None
    stats = {}
    for row in bonus_rows:
        if row["Type"] == BONUS_TYPE_NAME_SUFFIX:
            name = suffix_names[row["Value_0"]]
        elif row["Type"] == BONUS_TYPE_STAT:
            stat_name = GAME_STAT_NAMES[row["Value_0"]]
            stats[stat_name] = stats.get(stat_name, 0) + suffix_stat_value(budget, row["Value_1"])
    if name is None or EXCLUDED_NAME_PATTERN.search(name):
        return None
    return {"bonusId": int(bonus_rows[0]["ParentItemBonusListID"]), "name": name, "stats": stats}


def bonus_list_ids_of_tree(tree_id, nodes_by_tree):
    bonus_list_ids = []
    for node in nodes_by_tree.get(tree_id, []):
        if node["ChildItemBonusTreeID"] != "0":
            bonus_list_ids.extend(bonus_list_ids_of_tree(node["ChildItemBonusTreeID"], nodes_by_tree))
        if node["ChildItemBonusListID"] != "0":
            bonus_list_ids.append(node["ChildItemBonusListID"])
    return bonus_list_ids


def item_budget(sparse_row, budgets_by_level):
    quality_column = QUALITY_BUDGET_COLUMNS.get(sparse_row["OverallQualityID"])
    budget_index = INVENTORY_TYPE_BUDGET_INDEX.get(sparse_row["InventoryType"])
    budgets = budgets_by_level.get(sparse_row["ItemLevel"])
    if quality_column is None or budget_index is None or budgets is None:
        return None
    return int(budgets[f"{quality_column}_{budget_index}"])


def build_random_suffixes():
    suffix_names = {}
    for row in wago_table("ItemNameDescription"):
        suffix_names[row["ID"]] = row["Description_lang"]
    bonus_rows_by_list = {}
    for row in wago_table("ItemBonus"):
        bonus_rows_by_list.setdefault(row["ParentItemBonusListID"], []).append(row)
    nodes_by_tree = {}
    for row in wago_table("ItemBonusTreeNode"):
        nodes_by_tree.setdefault(row["ParentItemBonusTreeID"], []).append(row)
    budgets_by_level = {}
    for row in wago_table("RandPropPoints"):
        budgets_by_level[row["ID"]] = row
    sparse_rows = {}
    for row in wago_table("ItemSparse"):
        sparse_rows[row["ID"]] = row
    suffixes_by_item = {}
    for row in wago_table("ItemXBonusTree"):
        sparse_row = sparse_rows.get(row["ItemID"])
        if sparse_row is None:
            continue
        budget = item_budget(sparse_row, budgets_by_level)
        if budget is None:
            continue
        for bonus_list_id in bonus_list_ids_of_tree(row["ItemBonusTreeID"], nodes_by_tree):
            suffix = random_suffix(bonus_rows_by_list.get(bonus_list_id, []), suffix_names, budget)
            if suffix is not None:
                suffixes_by_item.setdefault(int(row["ItemID"]), []).append(suffix)
    return suffixes_by_item


def zone_names():
    area_index = cached_get("quest-area-index", "/data/wow/quest/area/index")
    names = {}
    for area in area_index.get("areas", []):
        names[area["id"]] = area["name"]
    return names


def write_javascript_global(file_name, global_name, payload):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    content = f"window.{global_name} = {json.dumps(payload, separators=(',', ':'), ensure_ascii=False)};\n"
    (OUTPUT_DIR / file_name).write_text(content.replace("</", "<\\/"))


def main():
    quest_sources = build_quest_sources()
    crafting_sources = build_crafting_sources()
    sources = merge_sources(quest_sources, crafting_sources)

    item_ids = search_equippable_item_ids()
    item_ids.update(item_id for item_id in sources)
    items = fetch_many("item", "/data/wow/item/{}", item_ids, "items")

    factions_by_reputation = reputation_factions(items)
    icons = item_icons(items)
    random_suffixes = build_random_suffixes()
    compact_items = []
    for item in items.values():
        if item["item_class"]["name"] not in EQUIPPABLE_ITEM_CLASSES:
            continue
        if not item.get("is_equippable"):
            continue
        if item["quality"]["type"] in EXCLUDED_QUALITIES:
            continue
        if item.get("required_level", 0) > MAX_REQUIRED_LEVEL:
            continue
        if EXCLUDED_NAME_PATTERN.search(item["name"]):
            continue
        record = compact_item(item)
        item_sources = sources.get(item["id"], [])
        if item_sources:
            record["sources"] = item_sources
        if item["id"] in icons:
            record["icon"] = icons[item["id"]]
        if item["id"] in random_suffixes:
            record["randomSuffixes"] = random_suffixes[item["id"]]
        faction = item_faction(item, item_sources, factions_by_reputation)
        if faction is not None:
            record["faction"] = faction
        compact_items.append(record)
    compact_items.sort(key=record_id)

    write_javascript_global("items.js", "FOREVER_ITEMS", compact_items)
    write_javascript_global("zones.js", "FOREVER_ZONES", zone_names())
    write_javascript_global("maps.js", "FOREVER_MAPS", build_maps())
    write_javascript_global("reputations.js", "FOREVER_REPUTATIONS", reputation_names())
    recipes = build_recipe_list()
    add_teaching_items(recipes)
    write_javascript_global("recipes.js", "FOREVER_RECIPES", recipes)
    write_javascript_global("crafting-items.js", "FOREVER_CRAFTING_ITEMS", build_crafting_items(recipes))
    print(f"Wrote {len(compact_items)} items", file=sys.stderr)


if __name__ == "__main__":
    main()
