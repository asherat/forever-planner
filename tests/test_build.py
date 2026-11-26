import importlib.util
import unittest
from pathlib import Path

BUILD_PATH = Path(__file__).resolve().parent.parent / "data" / "build.py"
SPEC = importlib.util.spec_from_file_location("build", BUILD_PATH)
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


def sample_item(**overrides):
    item = {
        "id": 1,
        "name": "Sample Staff",
        "quality": {"type": "RARE"},
        "inventory_type": {"type": "TWOHWEAPON"},
        "item_class": {"name": "Weapon"},
        "item_subclass": {"name": "Staff"},
        "level": 50,
        "required_level": 0,
        "preview_item": {
            "stats": [{"type": {"type": "AGILITY"}, "value": 10}],
            "spells": [{"description": "Equip: +54 Attack Power in Cat, Bear, and Dire Bear forms only."}],
            "requirements": {},
        },
    }
    item.update(overrides)
    return item


class CompactItemTest(unittest.TestCase):
    def test_reads_feral_attack_power_from_equip_effects(self):
        record = build.compact_item(sample_item())
        self.assertEqual(record["stats"]["FERAL_ATTACK_POWER"], 54)
        self.assertEqual(record["stats"]["AGILITY"], 10)

    def test_estimates_level_when_the_item_has_no_requirement(self):
        record = build.compact_item(sample_item())
        self.assertEqual(record["usableLevel"], 45)
        self.assertTrue(record["levelEstimated"])

    def test_keeps_the_real_required_level(self):
        record = build.compact_item(sample_item(required_level=42))
        self.assertEqual(record["usableLevel"], 42)
        self.assertNotIn("levelEstimated", record)

    def test_records_reputation_requirements(self):
        preview = sample_item()["preview_item"]
        preview["requirements"] = {
            "reputation": {"faction": {"id": 2827}, "min_reputation_level": 5, "display_string": "Requires Powderfuse - Honored"}
        }
        record = build.compact_item(sample_item(preview_item=preview))
        self.assertEqual(record["reputationRequirement"], {"factionId": 2827, "tier": 5})


class FilterTest(unittest.TestCase):
    def test_skips_test_and_placeholder_items(self):
        for name in ["QATest +1000 Spell Dmg Ring", "Ring of Uber Resists (TEST)", "Naxxramas Sword 1H 1 [PH]", "[TMP] Funerary Headdress"]:
            self.assertIsNotNone(build.EXCLUDED_NAME_PATTERN.search(name), name)

    def test_keeps_real_items(self):
        for name in ["Testament of Hope", "Nightscape Cloak", "Legionnaire's Band"]:
            self.assertIsNone(build.EXCLUDED_NAME_PATTERN.search(name), name)


class QuestTest(unittest.TestCase):
    def test_collects_reward_items_at_any_depth(self):
        rewards = {"items": {"items": [{"item": {"id": 5}}]}, "choice_of_items": [{"item": {"id": 7}}]}
        self.assertEqual(sorted(build.collect_reward_item_ids(rewards)), [5, 7])

    def test_reads_quest_faction_from_requirements_or_races(self):
        self.assertEqual(build.quest_faction({"requirements": {"faction": {"type": "HORDE"}}}, {}), "HORDE")
        races = {"requirements": {"races": [{"id": 1}, {"id": 3}]}}
        self.assertEqual(build.quest_faction(races, {1: "ALLIANCE", 3: "ALLIANCE"}), "ALLIANCE")
        self.assertIsNone(build.quest_faction({"requirements": {}}, {}))

    def test_item_faction_comes_from_one_sided_quests(self):
        sources = [{"type": "quest", "faction": "HORDE"}, {"type": "quest", "faction": "HORDE"}]
        self.assertEqual(build.item_faction(sample_item(), sources, {}), "HORDE")
        crafted = [{"type": "craft"}]
        self.assertIsNone(build.item_faction(sample_item(), crafted, {}))


if __name__ == "__main__":
    unittest.main()
