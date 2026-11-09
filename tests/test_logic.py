"""Unit tests for the Sprint 4 business rules (no database or web server needed).
Run:  python -m unittest discover -s tests -v
"""
import os, sys, unittest
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import mealplan_logic as L


class Scaling(unittest.TestCase):                      # UC-07 / R-07
    def test_double(self):      self.assertEqual(L.scale_quantity(1, 2, 4), Decimal("2.00"))
    def test_half(self):        self.assertEqual(L.scale_quantity(1, 2, 1), Decimal("0.50"))
    def test_decimal_target(self): self.assertEqual(L.scale_quantity(1, 2, 2.5), Decimal("1.25"))
    def test_round_half_up(self):  self.assertEqual(L.scale_quantity(Decimal("0.5"), 4, 3), Decimal("0.38"))
    def test_base_zero(self):
        with self.assertRaises(ValueError): L.scale_quantity(1, 0, 2)


class Weeks(unittest.TestCase):                        # UC-06
    def test_bounds_midweek(self):
        self.assertEqual(L.week_bounds(date(2026, 11, 7)), (date(2026, 11, 2), date(2026, 11, 8)))
    def test_bounds_sunday(self):
        self.assertEqual(L.week_bounds(date(2026, 11, 8)), (date(2026, 11, 2), date(2026, 11, 8)))
    def test_bounds_monday(self):
        self.assertEqual(L.week_bounds(date(2026, 11, 2))[0], date(2026, 11, 2))
    def test_plan_name(self):
        self.assertEqual(L.week_plan_name(date(2026, 11, 2)), "Week of Nov 2, 2026")


class Preferences(unittest.TestCase):                  # UC-04
    def test_diet_filters(self):
        self.assertIn("vegan", L.diet_sql("Vegan"))
        self.assertIn("protein_g", L.diet_sql("High Protein"))
        self.assertIsNone(L.diet_sql("Balanced"))
    def test_split(self):
        self.assertEqual(L.split_preferences(["Vegan", "Dairy Allergy", "Soy Allergy"]), ("Vegan", ["Dairy", "Soy"]))
        self.assertEqual(L.split_preferences([]), ("Balanced", []))
    def test_escape_like(self):
        self.assertEqual(L.escape_like(" 50%_off "), "50\\%\\_off")


class Pantry(unittest.TestCase):                       # UC-08
    def test_deduct(self):
        self.assertEqual(L.deduct_inventory(3, "lbs", 2, "lbs"), (Decimal("1.00"), Decimal("2.00")))
    def test_never_negative(self):
        self.assertEqual(L.deduct_inventory(1, "lbs", 2, "lbs"), (Decimal("0.00"), Decimal("1.00")))
    def test_units_must_match(self):
        self.assertIsNone(L.deduct_inventory(3, "kg", 2, "lbs"))


class Grocery(unittest.TestCase):                      # UC-09
    needs = {"a": {"ingredient_id": 1, "name": "Chicken", "unit": "lbs", "qty": 3, "price": 4},
             "b": {"ingredient_id": 2, "name": "Rice", "unit": "cups", "qty": 1, "price": 0.5}}
    def test_shortfall(self):
        out = L.grocery_shortfall(self.needs, {1: (Decimal(1), "lbs"), 2: (Decimal(5), "cups")})
        self.assertEqual([i["name"] for i in out], ["Chicken"])
        self.assertEqual(out[0]["to_buy"], Decimal("2.00")); self.assertEqual(out[0]["line_cost"], Decimal("8.00"))
    def test_other_unit_not_counted(self):
        out = L.grocery_shortfall(self.needs, {1: (Decimal(9), "kg")})
        self.assertEqual(next(i for i in out if i["name"] == "Chicken")["to_buy"], Decimal("3.00"))
    def test_all_covered(self):
        self.assertEqual(L.grocery_shortfall(self.needs, {1: (Decimal(3), "lbs"), 2: (Decimal(1), "cups")}), [])


class Goals(unittest.TestCase):                        # goal types and progress
    def test_validate(self):
        self.assertIsNotNone(L.validate_goal("weight_loss", 150, 160, 150))
        self.assertIsNone(L.validate_goal("weight_loss", 170, 160, 170))
        self.assertIsNotNone(L.validate_goal("weight_gain", 150, 140, 150))
        self.assertIsNotNone(L.validate_goal("calorie", None, 100, 0))
        self.assertIsNone(L.validate_goal("protein", None, 120, 0))
    def test_progress_loss(self):  self.assertEqual(L.goal_progress("weight_loss", 180, 170, 160), 50.0)
    def test_progress_gain(self):  self.assertEqual(L.goal_progress("weight_gain", 140, 145, 150), 50.0)
    def test_progress_capped(self): self.assertEqual(L.goal_progress("weight_loss", 180, 150, 160), 100.0)
    def test_progress_maintain(self): self.assertEqual(L.goal_progress("maintain", 160, 161, 160), 100.0)
    def test_progress_daily(self): self.assertEqual(L.goal_progress("protein", None, 60, 120), 50.0)
    def test_progress_no_start(self): self.assertEqual(L.goal_progress("weight_loss", None, 158, 150), 0)


class Recommendations(unittest.TestCase):              # goals + pantry drive the ranking
    light = {"title": "Salad", "calories": 400, "protein_g": 20}
    heavy = {"title": "Burger", "calories": 900, "protein_g": 40}
    def targets(self, goals):
        return L.goal_targets(goals, 2000, 3)
    def test_loss_prefers_light(self):
        t = self.targets([{"goal_type": "weight_loss", "target_value": 150}])
        self.assertGreater(L.score_recipe(self.light, t, [], set())[0], L.score_recipe(self.heavy, t, [], set())[0])
    def test_gain_prefers_hearty(self):
        t = self.targets([{"goal_type": "weight_gain", "target_value": 170}])
        self.assertGreater(L.score_recipe(self.heavy, t, [], set())[0], L.score_recipe(self.light, t, [], set())[0])
    def test_protein_goal(self):
        t = self.targets([{"goal_type": "protein", "target_value": 150}])      # 50 g per meal
        self.assertEqual(t["per_meal_protein"], 50)
        score, reasons = L.score_recipe({"title": "X", "calories": 600, "protein_g": 55}, t, [], set())
        self.assertTrue(any("protein goal" in r for r in reasons))
    def test_pantry_and_planned(self):
        t = self.targets([])
        base = L.score_recipe(self.light, t, [], set())[0]
        self.assertGreater(L.score_recipe(self.light, t, [("Chicken", True)], set())[0], base)
        self.assertLess(L.score_recipe(self.light, t, [], {"Salad"})[0], base)


if __name__ == "__main__":
    unittest.main()
