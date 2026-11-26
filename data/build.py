import base64
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

EQUIPPABLE_ITEM_CLASSES = {"Armor", "Weapon"}
EXCLUDED_QUALITIES = {"POOR"}
EXCLUDED_NAME_PATTERN = re.compile(r"^\[TMP\]|\bTEST\b|^QA|\[PH\]|Monster -|^Deprecated", re.IGNORECASE)
ICON_FILE_PATTERN = re.compile(r"/icons/\d+/(\d+)\.jpg$")
FERAL_ATTACK_POWER_PATTERN = re.compile(r"\+(\d+) Attack Power in Cat, Bear, and Dire Bear forms only")

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
    quest_records = []
    for quest_id, quest in quests.items():
        reward_item_ids = sorted(set(collect_reward_item_ids(quest.get("rewards", {}))))
        zone = quest.get("area", {}).get("name") or quest_zone.get(quest_id, "")
        experience = quest.get("rewards", {}).get("experience", 0)
        faction = quest_faction(quest, factions_by_race)
        quest_record = {
            "id": quest_id,
            "title": quest.get("title", ""),
            "zone": zone,
            "experience": experience,
            "rewardItemIds": reward_item_ids,
        }
        source = {
            "type": "quest",
            "questId": quest_id,
            "quest": quest.get("title", ""),
            "zone": zone,
        }
        if faction is not None:
            quest_record["faction"] = faction
            source["faction"] = faction
        quest_records.append(quest_record)
        for item_id in reward_item_ids:
            sources.setdefault(item_id, []).append(source)
    return sources, quest_records


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
                        "profession": profession["name"],
                        "itemId": crafted_item["id"],
                        "quantity": max(1, int(recipe.get("crafted_quantity", {}).get("value", 1))),
                        "reagents": reagents,
                    })
    return recipes


def build_crafting_items(recipes):
    item_ids = set()
    for recipe in recipes:
        item_ids.add(recipe["itemId"])
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
    quest_sources, quest_records = build_quest_sources()
    crafting_sources = build_crafting_sources()
    sources = merge_sources(quest_sources, crafting_sources)

    item_ids = search_equippable_item_ids()
    item_ids.update(item_id for item_id in sources)
    items = fetch_many("item", "/data/wow/item/{}", item_ids, "items")

    factions_by_reputation = reputation_factions(items)
    icons = item_icons(items)
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
        faction = item_faction(item, item_sources, factions_by_reputation)
        if faction is not None:
            record["faction"] = faction
        compact_items.append(record)
    compact_items.sort(key=record_id)

    write_javascript_global("items.js", "FOREVER_ITEMS", compact_items)
    write_javascript_global("quests.js", "FOREVER_QUESTS", sorted(quest_records, key=record_id))
    write_javascript_global("zones.js", "FOREVER_ZONES", zone_names())
    recipes = build_recipe_list()
    write_javascript_global("recipes.js", "FOREVER_RECIPES", recipes)
    write_javascript_global("crafting-items.js", "FOREVER_CRAFTING_ITEMS", build_crafting_items(recipes))
    write_javascript_global("build-info.js", "FOREVER_BUILD_INFO", {
        "builtAt": time.strftime("%Y-%m-%d %H:%M"),
        "itemCount": len(compact_items),
        "questCount": len(quest_records),
    })
    print(f"Wrote {len(compact_items)} items and {len(quest_records)} quests", file=sys.stderr)


if __name__ == "__main__":
    main()
