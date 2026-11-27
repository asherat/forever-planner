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
EXCLUDED_QUEST_NAME_PATTERN = re.compile(r"^DNT$|^<TXT>")
DUNGEON_FINDER_INSTANCE_TYPE = "0"
DUNGEON_WING_PATTERN = re.compile(r"^(Lower|Upper) | - (East|West|North)$")
DUNGEON_FINDER_NAME_FIXES = {
    "Zul'Farak": "Zul'Farrak",
    "Deadmines": "The Deadmines",
    "Stormwind Stockades": "The Stockade",
    "Hall of Thanes": "The Hall of Thanes",
    "Onyxia": "Onyxia's Lair",
}
DUNGEON_EXTRA_AREAS = {
    "The Stockade": ["Stormwind Stockade"],
    "Sunken Temple": ["The Temple of Atal'Hakkar"],
    "Excavation Site: Wetlands": ["Excavation Site"],
}
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

SIMULATOR_DATABASE_URL = "https://raw.githubusercontent.com/wowsims/forever/master/assets/database/db.json"
SIMULATOR_CURRENT_PHASE = 1
SIMULATOR_HEALING_POWER = "4"
SIMULATOR_SPELL_DAMAGE = "5"
SIMULATOR_ARMOR = "27"
SIMULATOR_STAT_NAMES = {
    "0": "STRENGTH", "1": "AGILITY", "2": "STAMINA", "3": "INTELLECT",
    "6": "BONUS_STAT_ARCANE_DAMAGE_DONE", "7": "BONUS_STAT_FIRE_DAMAGE_DONE", "8": "BONUS_STAT_FROST_DAMAGE_DONE",
    "9": "BONUS_STAT_HOLY_DAMAGE_DONE", "10": "BONUS_STAT_NATURE_DAMAGE_DONE", "11": "BONUS_STAT_SHADOW_DAMAGE_DONE",
    "12": "SPELL_PENETRATION", "13": "SPIRIT", "14": "ATTACK_POWER", "15": "RANGED_ATTACK_POWER", "16": "FERAL_ATTACK_POWER",
    "17": "HIT_RATING", "18": "CRIT_RATING", "19": "HASTE_RATING", "21": "EXPERTISE_RATING", "22": "DEFENSE_SKILL_RATING",
    "23": "BLOCK_RATING", "24": "BLOCK_VALUE", "25": "DODGE_RATING", "26": "PARRY_RATING", "28": "EXTRA_ARMOR",
    "31": "MANA_REGENERATION", "32": "ARCANE_RESISTANCE", "33": "FIRE_RESISTANCE", "34": "FROST_RESISTANCE",
    "35": "NATURE_RESISTANCE", "36": "SHADOW_RESISTANCE",
}
SIMULATOR_QUALITIES = {1: "COMMON", 2: "UNCOMMON", 3: "RARE", 4: "EPIC", 5: "LEGENDARY"}
SIMULATOR_ARMOR_SLOTS = {
    1: "HEAD", 2: "NECK", 3: "SHOULDER", 4: "CLOAK", 5: "CHEST", 6: "WRIST", 7: "HAND",
    8: "WAIST", 9: "LEGS", 10: "FEET", 11: "FINGER", 12: "TRINKET",
}
SIMULATOR_ARMOR_TYPES = {1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate"}
SIMULATOR_WEAPON_TYPES = {1: "Axe", 2: "Dagger", 3: "Fist Weapon", 4: "Mace", 6: "Polearm", 8: "Staff", 9: "Sword"}
SIMULATOR_HAND_SLOTS = {1: "WEAPONMAINHAND", 2: "WEAPON", 3: "WEAPONOFFHAND", 4: "TWOHWEAPON"}
SIMULATOR_RANGED_TYPES = {
    1: ("RANGED", "Weapon", "Bow"), 2: ("RANGEDRIGHT", "Weapon", "Crossbow"), 3: ("RANGEDRIGHT", "Weapon", "Gun"),
    4: ("THROWN", "Weapon", "Thrown"), 5: ("RANGEDRIGHT", "Weapon", "Wand"), 6: ("RELIC", "Armor", "Idol"),
    7: ("RELIC", "Armor", "Libram"), 8: ("RELIC", "Armor", "Totem"),
}
SIMULATOR_CLASSES = {1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest", 7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid"}
SIMULATOR_FACTIONS = {1: "ALLIANCE", 2: "HORDE"}
REPUTATION_TIER_NAMES = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"]

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
    if item.get("purchase_price", 0) > 0:
        record["vendorPrice"] = item["purchase_price"]
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


def simulator_database():
    cache_file = CACHE_DIR / "wowsims" / "db.json"
    if not cache_file.exists():
        request = urllib.request.Request(SIMULATOR_DATABASE_URL, headers={"User-Agent": WAGO_USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            text = response.read().decode("utf-8")
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(text)
    return json.loads(cache_file.read_text())


def simulator_stats(raw_stats, budget=None):
    stats = {}
    for stat_index, value in raw_stats.items():
        if budget is not None:
            value = suffix_stat_value(budget, value)
        stat_name = SIMULATOR_STAT_NAMES.get(stat_index)
        if stat_name is not None and value:
            stats[stat_name] = stats.get(stat_name, 0) + value
    healing = raw_stats.get(SIMULATOR_HEALING_POWER, 0)
    damage = raw_stats.get(SIMULATOR_SPELL_DAMAGE, 0)
    if budget is not None:
        healing = suffix_stat_value(budget, healing)
        damage = suffix_stat_value(budget, damage)
    if healing and healing == damage:
        stats["SPELL_POWER"] = healing
    else:
        if healing:
            stats["SPELL_HEALING_DONE"] = healing
        if damage:
            stats["SPELL_DAMAGE_DONE"] = damage
    return stats


def simulator_slot(item):
    item_type = item.get("type", 0)
    if item_type in SIMULATOR_ARMOR_SLOTS:
        subclass = SIMULATOR_ARMOR_TYPES.get(item.get("armorType"), "Miscellaneous")
        return SIMULATOR_ARMOR_SLOTS[item_type], "Armor", subclass
    if item_type == 14:
        return SIMULATOR_RANGED_TYPES.get(item.get("rangedWeaponType"))
    if item_type != 13:
        return None
    weapon_type = item.get("weaponType")
    if weapon_type == 7:
        return "SHIELD", "Armor", "Shield"
    if weapon_type == 5:
        return "HOLDABLE", "Armor", "Miscellaneous"
    if weapon_type not in SIMULATOR_WEAPON_TYPES or item.get("handType") not in SIMULATOR_HAND_SLOTS:
        return None
    return SIMULATOR_HAND_SLOTS[item["handType"]], "Weapon", SIMULATOR_WEAPON_TYPES[weapon_type]


def simulator_sources(item, zone_names_by_id):
    sources = []
    for source in item.get("sources", []):
        quest = source.get("quest")
        if quest is None:
            continue
        record = {"type": "quest", "questId": quest["id"], "quest": quest["name"], "zone": quest_zone_name(quest, zone_names_by_id)}
        if quest.get("faction") in SIMULATOR_FACTIONS:
            record["faction"] = SIMULATOR_FACTIONS[quest["faction"]]
        sources.append(record)
    return sources


def quest_zone_name(quest, zone_names_by_id):
    battle_net_quest = cached_get(f"quest/{quest['id']}", f"/data/wow/quest/{quest['id']}")
    if battle_net_quest is not None and battle_net_quest.get("area", {}).get("name"):
        return battle_net_quest["area"]["name"]
    return zone_names_by_id.get(quest.get("zoneId"), "")


def simulator_reputation(item, reputation_names_by_id):
    for source in item.get("sources", []):
        reputation = source.get("rep")
        if reputation is None or reputation.get("repFactionId") not in reputation_names_by_id:
            continue
        tier = reputation["repLevel"] - 1
        faction = reputation_names_by_id[reputation["repFactionId"]]
        requirement = {"factionId": reputation["repFactionId"], "tier": tier}
        return requirement, f"Requires {faction['name']} - {REPUTATION_TIER_NAMES[tier]}", faction["side"]
    return None, None, None


def simulator_suffixes(item, suffixes_by_id, budget):
    suffixes = []
    for suffix_id in item.get("randomSuffixOptions", []):
        suffix = suffixes_by_id.get(suffix_id)
        if suffix is None or EXCLUDED_NAME_PATTERN.search(suffix["name"]):
            continue
        allocations = {}
        for stat_index, allocation in enumerate(suffix["stats"]):
            if allocation:
                allocations[str(stat_index)] = allocation
        suffixes.append({"bonusId": suffix_id, "name": suffix["name"], "stats": simulator_stats(allocations, budget)})
    return suffixes


def compact_simulator_item(item, zone_names_by_id, reputation_names_by_id, suffixes_by_id):
    slot = simulator_slot(item)
    if slot is None or item.get("phase") != SIMULATOR_CURRENT_PHASE or item.get("quality") not in SIMULATOR_QUALITIES:
        return None
    if EXCLUDED_NAME_PATTERN.search(item["name"]) or item.get("reqLvl", 0) > MAX_REQUIRED_LEVEL:
        return None
    scaling = next(iter(item["scalingOptions"].values()))
    raw_stats = scaling.get("stats", {})
    record = {
        "id": item["id"],
        "name": item["name"],
        "quality": SIMULATOR_QUALITIES[item["quality"]],
        "slot": slot[0],
        "itemClass": slot[1],
        "itemSubclass": slot[2],
        "itemLevel": scaling.get("ilvl", 0),
        "requiredLevel": item.get("reqLvl", 0),
        "binding": "",
        "armor": raw_stats.get(SIMULATOR_ARMOR, 0),
        "stats": simulator_stats(raw_stats),
        "effects": [],
        "iconName": item.get("icon", ""),
        "fromSimulator": True,
    }
    for effect in item.get("itemEffects", []):
        if "proc" in effect:
            record["effects"].append("Chance on hit: " + re.sub(r" \(\d+\)$", "", effect.get("buffName", "")))
    if record["requiredLevel"] > 0:
        record["usableLevel"] = record["requiredLevel"]
    else:
        record["usableLevel"] = min(MAX_REQUIRED_LEVEL, max(1, record["itemLevel"] - ESTIMATED_LEVEL_OFFSET))
        record["levelEstimated"] = True
    if "weaponDamageMin" in scaling:
        record["weapon"] = {
            "minimumDamage": scaling["weaponDamageMin"],
            "maximumDamage": scaling["weaponDamageMax"],
            "speed": item.get("weaponSpeed", 0),
            "damagePerSecond": round(scaling.get("unroundedDps", 0), 2),
        }
    classes = []
    for class_id in item.get("classAllowlist", []):
        if class_id in SIMULATOR_CLASSES:
            classes.append(SIMULATOR_CLASSES[class_id])
    if classes:
        record["classes"] = classes
    if item.get("factionRestriction") in SIMULATOR_FACTIONS:
        record["faction"] = SIMULATOR_FACTIONS[item["factionRestriction"]]
    sources = simulator_sources(item, zone_names_by_id)
    if sources:
        record["sources"] = sources
    requirement, requirement_text, side = simulator_reputation(item, reputation_names_by_id)
    if requirement is not None:
        record["reputationRequirement"] = requirement
        record["reputation"] = requirement_text
        if side is not None:
            record["faction"] = side
    suffixes = simulator_suffixes(item, suffixes_by_id, scaling.get("randPropPoints", 0))
    if suffixes:
        record["randomSuffixes"] = suffixes
    return record


def simulator_items(known_item_ids, reputation_names_by_id):
    database = simulator_database()
    zone_names_by_id = {}
    for zone in database.get("zones", []):
        zone_names_by_id[zone["id"]] = zone["name"]
    suffixes_by_id = {}
    for suffix in database.get("randomSuffixes", []):
        suffixes_by_id[suffix["id"]] = suffix
    records = []
    for item in database["items"]:
        if item["id"] in known_item_ids:
            continue
        record = compact_simulator_item(item, zone_names_by_id, reputation_names_by_id, suffixes_by_id)
        if record is not None:
            records.append(record)
    return records


def instance_name(dungeon_finder_name):
    name = DUNGEON_FINDER_NAME_FIXES.get(dungeon_finder_name, dungeon_finder_name)
    return DUNGEON_WING_PATTERN.sub("", name)


def build_dungeons():
    area_index = cached_get("quest-area-index", "/data/wow/quest/area/index")
    area_ids = {}
    for area in area_index.get("areas", []):
        area_ids[area["name"]] = area["id"]
    tuning_levels = {}
    for row in wago_table("ContentTuning"):
        tuning_levels[row["ID"]] = int(row["MinLevelSquish"])
    dungeons = {}
    for row in wago_table("LFGDungeons"):
        if row["TypeID"] != DUNGEON_FINDER_INSTANCE_TYPE:
            continue
        name = instance_name(row["Name_lang"])
        level = tuning_levels.get(row["ContentTuningID"], 0)
        if name not in dungeons:
            dungeons[name] = {"name": name, "minLevel": level, "areas": [name] + DUNGEON_EXTRA_AREAS.get(name, [])}
        dungeons[name]["minLevel"] = min(dungeons[name]["minLevel"], level)
    for dungeon in dungeons.values():
        quest_ids = []
        for area_name in dungeon["areas"]:
            if area_name not in area_ids:
                continue
            area = cached_get(f"quest-area/{area_ids[area_name]}", f"/data/wow/quest/area/{area_ids[area_name]}")
            for quest in (area or {}).get("quests", []):
                if not EXCLUDED_QUEST_NAME_PATTERN.search(quest.get("name", "")):
                    quest_ids.append(quest["id"])
        dungeon["questIds"] = sorted(set(quest_ids))
    return sorted(dungeons.values(), key=dungeon_sort_key)


def dungeon_sort_key(dungeon):
    return (dungeon["minLevel"], dungeon["name"])


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
    reputation_names_by_id = {}
    for name, faction in reputation_names().items():
        reputation_names_by_id[int(faction["id"])] = {"name": name, "side": faction["side"]}
    known_item_ids = set(record["id"] for record in compact_items)
    compact_items.extend(simulator_items(known_item_ids, reputation_names_by_id))
    compact_items.sort(key=record_id)

    write_javascript_global("items.js", "FOREVER_ITEMS", compact_items)
    write_javascript_global("zones.js", "FOREVER_ZONES", zone_names())
    write_javascript_global("dungeons.js", "FOREVER_DUNGEONS", build_dungeons())
    write_javascript_global("maps.js", "FOREVER_MAPS", build_maps())
    write_javascript_global("reputations.js", "FOREVER_REPUTATIONS", reputation_names())
    recipes = build_recipe_list()
    add_teaching_items(recipes)
    write_javascript_global("recipes.js", "FOREVER_RECIPES", recipes)
    write_javascript_global("crafting-items.js", "FOREVER_CRAFTING_ITEMS", build_crafting_items(recipes))
    print(f"Wrote {len(compact_items)} items", file=sys.stderr)


if __name__ == "__main__":
    main()
