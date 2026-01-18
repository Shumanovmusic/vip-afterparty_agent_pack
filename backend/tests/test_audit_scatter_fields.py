"""
Regression gate for Hype Mode scatter chance fields in audit CSV.

Per GAME_RULES.md and TELEMETRY.md:
- Audit must report: scatter_chance_base, scatter_chance_effective, scatter_chance_multiplier
- Hype mode: effective == base * multiplier
- Multiplier must match CONFIG.md HYPE_MODE_BONUS_CHANCE_MULTIPLIER

Usage:
    pytest tests/test_audit_scatter_fields.py -v
"""
import csv

import pytest

from app.config import settings
from scripts.audit_sim import generate_csv, run_simulation

# Required scatter chance columns per TELEMETRY.md
SCATTER_CHANCE_FIELDS = [
    "scatter_chance_base",
    "scatter_chance_effective",
    "scatter_chance_multiplier",
]

# Test parameters
TEST_ROUNDS = 5000
TEST_SEED = "SCATTER_GATE_2025"


class TestAuditScatterFields:
    """Regression gate for scatter chance CSV fields."""

    @pytest.fixture(scope="class")
    def base_csv_row(self, tmp_path_factory):
        """Run base mode audit and return CSV row (temp file, no cache)."""
        stats = run_simulation(
            mode="base",
            rounds=TEST_ROUNDS,
            seed_str=TEST_SEED,
            verbose=False,
        )
        tmp_dir = tmp_path_factory.mktemp("scatter_audit")
        csv_path = tmp_dir / "base.csv"
        generate_csv(
            mode="base",
            rounds=TEST_ROUNDS,
            seed_str=TEST_SEED,
            stats=stats,
            output_path=str(csv_path),
        )
        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            return next(reader)

    @pytest.fixture(scope="class")
    def hype_csv_row(self, tmp_path_factory):
        """Run hype mode audit and return CSV row (temp file, no cache)."""
        stats = run_simulation(
            mode="hype",
            rounds=TEST_ROUNDS,
            seed_str=TEST_SEED,
            verbose=False,
        )
        tmp_dir = tmp_path_factory.mktemp("scatter_audit")
        csv_path = tmp_dir / "hype.csv"
        generate_csv(
            mode="hype",
            rounds=TEST_ROUNDS,
            seed_str=TEST_SEED,
            stats=stats,
            output_path=str(csv_path),
        )
        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            return next(reader)

    def test_base_csv_contains_scatter_fields(self, base_csv_row):
        """Base mode CSV MUST contain all scatter_chance fields per TELEMETRY.md."""
        missing = [f for f in SCATTER_CHANCE_FIELDS if f not in base_csv_row]
        assert not missing, f"Base CSV missing scatter fields: {missing}"

    def test_hype_csv_contains_scatter_fields(self, hype_csv_row):
        """Hype mode CSV MUST contain all scatter_chance fields per TELEMETRY.md."""
        missing = [f for f in SCATTER_CHANCE_FIELDS if f not in hype_csv_row]
        assert not missing, f"Hype CSV missing scatter fields: {missing}"

    def test_base_scatter_values_correct(self, base_csv_row):
        """Base mode scatter values MUST be: base=0.02, effective=0.02, multiplier=1.0."""
        base = float(base_csv_row["scatter_chance_base"])
        effective = float(base_csv_row["scatter_chance_effective"])
        multiplier = float(base_csv_row["scatter_chance_multiplier"])

        assert base == 0.02, f"Base scatter_chance_base should be 0.02, got {base}"
        assert effective == 0.02, f"Base scatter_chance_effective should be 0.02, got {effective}"
        assert multiplier == 1.0, f"Base scatter_chance_multiplier should be 1.0, got {multiplier}"

    def test_hype_multiplier_matches_config(self, hype_csv_row):
        """Hype mode multiplier MUST match CONFIG.md HYPE_MODE_BONUS_CHANCE_MULTIPLIER."""
        csv_multiplier = float(hype_csv_row["scatter_chance_multiplier"])
        config_multiplier = settings.hype_mode_bonus_chance_multiplier

        assert csv_multiplier == config_multiplier, (
            f"Hype CSV multiplier ({csv_multiplier}) != "
            f"CONFIG.md HYPE_MODE_BONUS_CHANCE_MULTIPLIER ({config_multiplier})"
        )

    def test_hype_effective_equals_base_times_multiplier(self, hype_csv_row):
        """Hype mode: effective MUST equal base * multiplier (exact)."""
        base = float(hype_csv_row["scatter_chance_base"])
        effective = float(hype_csv_row["scatter_chance_effective"])
        multiplier = float(hype_csv_row["scatter_chance_multiplier"])

        expected_effective = base * multiplier
        assert abs(effective - expected_effective) < 1e-6, (
            f"Hype effective ({effective}) != base ({base}) * multiplier ({multiplier}) = {expected_effective}"
        )

    def test_hype_scatter_chance_increased(self, base_csv_row, hype_csv_row):
        """Hype mode effective scatter chance MUST be > base mode effective."""
        base_effective = float(base_csv_row["scatter_chance_effective"])
        hype_effective = float(hype_csv_row["scatter_chance_effective"])

        assert hype_effective > base_effective, (
            f"Hype effective ({hype_effective}) should be > base effective ({base_effective})"
        )

    def test_hype_base_chance_unchanged(self, base_csv_row, hype_csv_row):
        """Hype mode base chance MUST equal base mode base chance (unchanged)."""
        base_base = float(base_csv_row["scatter_chance_base"])
        hype_base = float(hype_csv_row["scatter_chance_base"])

        assert hype_base == base_base, (
            f"Hype scatter_chance_base ({hype_base}) should equal base ({base_base})"
        )
