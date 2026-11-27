import importlib.util
import unittest
from unittest import mock
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


class RandomSuffixTest(unittest.TestCase):
    def test_scales_suffix_stats_by_the_item_budget(self):
        rows = [
            {"ParentItemBonusListID": "12727", "Type": "2", "Value_0": "3", "Value_1": "6666"},
            {"ParentItemBonusListID": "12727", "Type": "2", "Value_0": "4", "Value_1": "6666"},
            {"ParentItemBonusListID": "12727", "Type": "5", "Value_0": "14307", "Value_1": "0"},
        ]
        suffix = build.random_suffix(rows, {"14307": "of the Tiger"}, 19)
        self.assertEqual(suffix, {"bonusId": 12727, "name": "of the Tiger", "stats": {"AGILITY": 13, "STRENGTH": 13}})

    def test_ignores_bonus_lists_without_a_suffix_name(self):
        rows = [{"ParentItemBonusListID": "13899", "Type": "0", "Value_0": "0", "Value_1": "0"}]
        self.assertIsNone(build.random_suffix(rows, {}, 19))

    def test_skips_test_suffixes(self):
        rows = [{"ParentItemBonusListID": "1", "Type": "5", "Value_0": "9", "Value_1": "0"}]
        self.assertIsNone(build.random_suffix(rows, {"9": "Test"}, 19))

    def test_budget_depends_on_slot_and_quality(self):
        budgets = {"45": {"Good_0": "19", "Good_1": "14", "Superior_0": "26"}}
        self.assertEqual(build.item_budget({"OverallQualityID": "2", "InventoryType": "1", "ItemLevel": "45"}, budgets), 19)
        self.assertEqual(build.item_budget({"OverallQualityID": "2", "InventoryType": "3", "ItemLevel": "45"}, budgets), 14)
        self.assertEqual(build.item_budget({"OverallQualityID": "3", "InventoryType": "1", "ItemLevel": "45"}, budgets), 26)


class SimulatorItemTest(unittest.TestCase):
    def sample(self, **overrides):
        item = {
            "id": 279480, "name": "Bigger Rock on Bigger Stick", "type": 13, "weaponType": 4, "handType": 4,
            "weaponSpeed": 3.4, "reqLvl": 1, "phase": 1, "quality": 3,
            "sources": [{"quest": {"id": 94968, "name": "Eye of Mugg", "faction": 2, "zoneId": 16842}}],
            "scalingOptions": {"0": {"randPropPoints": 27, "weaponDamageMin": 112, "weaponDamageMax": 168, "unroundedDps": 41.197216, "stats": {"0": 14}, "ilvl": 47}},
            "itemEffects": [{"buffName": "Bigger Rock to the Face (1306816)", "proc": {"ppm": 1.5}}],
        }
        item.update(overrides)
        return item

    @mock.patch.object(build, "cached_get", return_value=None)
    def test_converts_a_quest_weapon(self, cached_get):
        record = build.compact_simulator_item(self.sample(), {16842: "Krol'dok Stronghold"}, {}, {})
        self.assertEqual(record["slot"], "TWOHWEAPON")
        self.assertEqual(record["itemSubclass"], "Mace")
        self.assertEqual(record["stats"], {"STRENGTH": 14})
        self.assertEqual(record["weapon"]["damagePerSecond"], 41.2)
        self.assertEqual(record["effects"], ["Chance on hit: Bigger Rock to the Face"])
        self.assertEqual(record["sources"], [{"type": "quest", "questId": 94968, "quest": "Eye of Mugg", "zone": "Krol'dok Stronghold", "faction": "HORDE"}])

    def test_skips_items_from_later_phases(self):
        self.assertIsNone(build.compact_simulator_item(self.sample(phase=2), {}, {}, {}))

    def test_equal_healing_and_damage_is_spell_power(self):
        self.assertEqual(build.simulator_stats({"4": 36, "5": 36}), {"SPELL_POWER": 36})
        self.assertEqual(build.simulator_stats({"4": 22, "5": 7}), {"SPELL_HEALING_DONE": 22, "SPELL_DAMAGE_DONE": 7})

    def test_reads_reputation_requirements(self):
        item = self.sample(sources=[{"rep": {"repFactionId": 530, "repLevel": 6}}])
        record = build.compact_simulator_item(item, {}, {530: {"name": "Darkspear Trolls", "side": "HORDE"}}, {})
        self.assertEqual(record["reputationRequirement"], {"factionId": 530, "tier": 5})
        self.assertEqual(record["reputation"], "Requires Darkspear Trolls - Honored")
        self.assertEqual(record["faction"], "HORDE")


class DungeonNameTest(unittest.TestCase):
    def test_merges_wings_into_one_instance(self):
        self.assertEqual(build.instance_name("Dire Maul - East"), "Dire Maul")
        self.assertEqual(build.instance_name("Lower Blackrock Spire"), "Blackrock Spire")
        self.assertEqual(build.instance_name("Upper Blackrock Spire"), "Blackrock Spire")

    def test_fixes_the_game_data_spellings(self):
        self.assertEqual(build.instance_name("Zul'Farak"), "Zul'Farrak")
        self.assertEqual(build.instance_name("Stormwind Stockades"), "The Stockade")
        self.assertEqual(build.instance_name("Krol'dok Stronghold"), "Krol'dok Stronghold")
