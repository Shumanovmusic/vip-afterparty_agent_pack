"""
Laws Freeze Gate (Gate A) - Verify law files contain required sections.

This test ensures that law files (GAME_RULES.md, CONFIG.md, TELEMETRY.md)
contain explicit definitions for all required mechanics before freezing.

Purpose:
- Prevent regression where law sections are accidentally deleted
- Ensure audit trail for VIP Bonus Buy, Rage, Spotlight, Hype mechanics
- Validate that CONFIG.md defines all numeric parameters referenced in rules

Usage:
    pytest tests/test_laws_freeze_gate.py -v

Source of Truth:
    - GAME_RULES.md: Game mechanics definitions
    - CONFIG.md: Numeric parameters
    - TELEMETRY.md: Logging fields
"""
import pytest
import re
from pathlib import Path

# Project root (3 levels up from this test file)
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestGameRulesLawsFreeze:
    """Verify GAME_RULES.md contains required sections."""

    @pytest.fixture(scope="class")
    def game_rules_content(self) -> str:
        """Load GAME_RULES.md content."""
        game_rules_path = PROJECT_ROOT / "GAME_RULES.md"
        assert game_rules_path.exists(), f"GAME_RULES.md not found at {game_rules_path}"
        return game_rules_path.read_text()

    def test_vip_bonus_buy_section_exists(self, game_rules_content):
        """GAME_RULES.md MUST include explicit VIP Bonus Buy section."""
        # Check for section header
        assert re.search(
            r"VIP Bonus Buy|BUY_FEATURE", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing VIP Bonus Buy / BUY_FEATURE section"

    def test_vip_bonus_buy_variant_defined(self, game_rules_content):
        """VIP Bonus Buy section MUST define bonus_variant (standard vs vip_buy)."""
        assert "bonus_variant" in game_rules_content.lower(), (
            "GAME_RULES.md missing bonus_variant definition in VIP Bonus Buy section"
        )
        assert "standard" in game_rules_content.lower(), (
            "GAME_RULES.md missing 'standard' variant reference"
        )
        assert "vip_buy" in game_rules_content.lower(), (
            "GAME_RULES.md missing 'vip_buy' variant reference"
        )

    def test_vip_bonus_buy_multiplier_defined(self, game_rules_content):
        """VIP Bonus Buy section MUST define payout multiplier behavior."""
        # Check for multiplier reference
        assert re.search(
            r"BUY_BONUS_PAYOUT_MULTIPLIER|payout.*multiplier", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing BUY_BONUS_PAYOUT_MULTIPLIER or payout multiplier definition"

    def test_vip_bonus_buy_cost_defined(self, game_rules_content):
        """VIP Bonus Buy section MUST define cost multiplier."""
        assert re.search(
            r"BUY_FEATURE_COST_MULTIPLIER|Cost.*100", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing BUY_FEATURE_COST_MULTIPLIER or cost definition"

    def test_rage_mode_section_exists(self, game_rules_content):
        """GAME_RULES.md MUST include Rage Mode section with payout/chance effects."""
        assert re.search(
            r"Rage Mode|RAGE|AFTERPARTY.*METER", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Rage Mode / Afterparty Meter section"

    def test_rage_mode_multiplier_defined(self, game_rules_content):
        """Rage Mode section MUST define multiplier effect."""
        assert re.search(
            r"AFTERPARTY_RAGE_MULTIPLIER|rage.*multiplier|x2", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Rage Mode multiplier definition"

    def test_rage_mode_trigger_defined(self, game_rules_content):
        """Rage Mode section MUST define trigger conditions."""
        assert re.search(
            r"afterparty_meter|METER_MAX|trigger", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Rage Mode trigger conditions"

    def test_spotlight_wilds_section_exists(self, game_rules_content):
        """GAME_RULES.md MUST include Spotlight Wilds section."""
        assert re.search(
            r"Spotlight.*Wild|SPOTLIGHT_WILDS", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Spotlight Wilds section"

    def test_spotlight_wilds_effect_defined(self, game_rules_content):
        """Spotlight Wilds section MUST define effect (converts positions to WILD)."""
        # Check for effect description (supports English or Russian text)
        # Russian: "превращает их в WILD" = "turns them into WILD"
        assert re.search(
            r"(convert|transform|turn|превращ).*WILD|WILD.*position|1.*to.*3|от\s+1\s+до\s+3",
            game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Spotlight Wilds effect definition"

    def test_spotlight_wilds_frequency_defined(self, game_rules_content):
        """Spotlight Wilds section MUST reference frequency parameter."""
        assert re.search(
            r"SPOTLIGHT_WILDS_FREQUENCY|frequency", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Spotlight Wilds frequency reference"

    def test_hype_mode_section_exists(self, game_rules_content):
        """GAME_RULES.md MUST include Hype Mode (Ante Bet) section."""
        assert re.search(
            r"Hype Mode|HYPE_MODE|Ante Bet", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Hype Mode / Ante Bet section"

    def test_hype_mode_cost_defined(self, game_rules_content):
        """Hype Mode section MUST define cost increase."""
        assert re.search(
            r"HYPE_MODE_COST_INCREASE|\+25%|cost.*increase", game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Hype Mode cost increase definition"

    def test_hype_mode_effect_defined(self, game_rules_content):
        """Hype Mode section MUST define bonus chance multiplier effect."""
        assert re.search(
            r"HYPE_MODE_BONUS_CHANCE_MULTIPLIER|bonus.*chance|SCATTER.*increase",
            game_rules_content, re.IGNORECASE
        ), "GAME_RULES.md missing Hype Mode bonus chance effect definition"

    def test_max_win_cap_defined(self, game_rules_content):
        """GAME_RULES.md MUST define MAX_WIN_TOTAL_X cap."""
        assert "MAX_WIN_TOTAL_X" in game_rules_content, (
            "GAME_RULES.md missing MAX_WIN_TOTAL_X cap definition"
        )
        assert "25000" in game_rules_content, (
            "GAME_RULES.md missing 25000x cap value"
        )


class TestConfigLawsFreeze:
    """Verify CONFIG.md defines all required numeric parameters."""

    @pytest.fixture(scope="class")
    def config_content(self) -> str:
        """Load CONFIG.md content."""
        config_path = PROJECT_ROOT / "CONFIG.md"
        assert config_path.exists(), f"CONFIG.md not found at {config_path}"
        return config_path.read_text()

    # VIP Bonus Buy parameters
    def test_buy_feature_cost_multiplier_defined(self, config_content):
        """CONFIG.md MUST define BUY_FEATURE_COST_MULTIPLIER."""
        assert "BUY_FEATURE_COST_MULTIPLIER" in config_content, (
            "CONFIG.md missing BUY_FEATURE_COST_MULTIPLIER"
        )
        # Verify it has a numeric value
        assert re.search(r"BUY_FEATURE_COST_MULTIPLIER\s*=\s*\d+", config_content), (
            "CONFIG.md BUY_FEATURE_COST_MULTIPLIER missing numeric value"
        )

    def test_buy_bonus_payout_multiplier_defined(self, config_content):
        """CONFIG.md MUST define BUY_BONUS_PAYOUT_MULTIPLIER."""
        assert "BUY_BONUS_PAYOUT_MULTIPLIER" in config_content, (
            "CONFIG.md missing BUY_BONUS_PAYOUT_MULTIPLIER"
        )
        assert re.search(r"BUY_BONUS_PAYOUT_MULTIPLIER\s*=\s*\d+", config_content), (
            "CONFIG.md BUY_BONUS_PAYOUT_MULTIPLIER missing numeric value"
        )

    def test_enable_vip_buy_bonus_variant_defined(self, config_content):
        """CONFIG.md MUST define ENABLE_VIP_BUY_BONUS_VARIANT."""
        assert "ENABLE_VIP_BUY_BONUS_VARIANT" in config_content, (
            "CONFIG.md missing ENABLE_VIP_BUY_BONUS_VARIANT flag"
        )

    # Rage Mode parameters
    def test_afterparty_meter_max_defined(self, config_content):
        """CONFIG.md MUST define AFTERPARTY_METER_MAX."""
        assert "AFTERPARTY_METER_MAX" in config_content, (
            "CONFIG.md missing AFTERPARTY_METER_MAX"
        )
        assert re.search(r"AFTERPARTY_METER_MAX\s*=\s*\d+", config_content), (
            "CONFIG.md AFTERPARTY_METER_MAX missing numeric value"
        )

    def test_afterparty_rage_spins_defined(self, config_content):
        """CONFIG.md MUST define AFTERPARTY_RAGE_SPINS."""
        assert "AFTERPARTY_RAGE_SPINS" in config_content, (
            "CONFIG.md missing AFTERPARTY_RAGE_SPINS"
        )

    def test_afterparty_rage_multiplier_defined(self, config_content):
        """CONFIG.md MUST define AFTERPARTY_RAGE_MULTIPLIER."""
        assert "AFTERPARTY_RAGE_MULTIPLIER" in config_content, (
            "CONFIG.md missing AFTERPARTY_RAGE_MULTIPLIER"
        )

    def test_enable_afterparty_meter_defined(self, config_content):
        """CONFIG.md MUST define ENABLE_AFTERPARTY_METER."""
        assert "ENABLE_AFTERPARTY_METER" in config_content, (
            "CONFIG.md missing ENABLE_AFTERPARTY_METER flag"
        )

    # Spotlight Wilds parameters
    def test_spotlight_wilds_frequency_defined(self, config_content):
        """CONFIG.md MUST define SPOTLIGHT_WILDS_FREQUENCY."""
        assert "SPOTLIGHT_WILDS_FREQUENCY" in config_content, (
            "CONFIG.md missing SPOTLIGHT_WILDS_FREQUENCY"
        )
        assert re.search(r"SPOTLIGHT_WILDS_FREQUENCY\s*=\s*[\d.]+", config_content), (
            "CONFIG.md SPOTLIGHT_WILDS_FREQUENCY missing numeric value"
        )

    def test_enable_spotlight_wilds_defined(self, config_content):
        """CONFIG.md MUST define ENABLE_SPOTLIGHT_WILDS."""
        assert "ENABLE_SPOTLIGHT_WILDS" in config_content, (
            "CONFIG.md missing ENABLE_SPOTLIGHT_WILDS flag"
        )

    # Hype Mode parameters
    def test_hype_mode_cost_increase_defined(self, config_content):
        """CONFIG.md MUST define HYPE_MODE_COST_INCREASE."""
        assert "HYPE_MODE_COST_INCREASE" in config_content, (
            "CONFIG.md missing HYPE_MODE_COST_INCREASE"
        )
        assert re.search(r"HYPE_MODE_COST_INCREASE\s*=\s*[\d.]+", config_content), (
            "CONFIG.md HYPE_MODE_COST_INCREASE missing numeric value"
        )

    def test_hype_mode_bonus_chance_multiplier_defined(self, config_content):
        """CONFIG.md MUST define HYPE_MODE_BONUS_CHANCE_MULTIPLIER."""
        assert "HYPE_MODE_BONUS_CHANCE_MULTIPLIER" in config_content, (
            "CONFIG.md missing HYPE_MODE_BONUS_CHANCE_MULTIPLIER"
        )

    def test_enable_hype_mode_ante_bet_defined(self, config_content):
        """CONFIG.md MUST define ENABLE_HYPE_MODE_ANTE_BET."""
        assert "ENABLE_HYPE_MODE_ANTE_BET" in config_content, (
            "CONFIG.md missing ENABLE_HYPE_MODE_ANTE_BET flag"
        )

    # Max Win Cap
    def test_max_win_total_x_defined(self, config_content):
        """CONFIG.md MUST define MAX_WIN_TOTAL_X."""
        assert "MAX_WIN_TOTAL_X" in config_content, (
            "CONFIG.md missing MAX_WIN_TOTAL_X"
        )
        assert re.search(r"MAX_WIN_TOTAL_X\s*=\s*\d+", config_content), (
            "CONFIG.md MAX_WIN_TOTAL_X missing numeric value"
        )


class TestTelemetryLawsFreeze:
    """Verify TELEMETRY.md contains required fields for audit/tracking."""

    @pytest.fixture(scope="class")
    def telemetry_content(self) -> str:
        """Load TELEMETRY.md content."""
        telemetry_path = PROJECT_ROOT / "TELEMETRY.md"
        assert telemetry_path.exists(), f"TELEMETRY.md not found at {telemetry_path}"
        return telemetry_path.read_text()

    # VIP Bonus Buy telemetry fields
    def test_bonus_is_bought_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define bonus_is_bought field."""
        assert "bonus_is_bought" in telemetry_content.lower(), (
            "TELEMETRY.md missing bonus_is_bought field"
        )

    def test_bonus_variant_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define bonus_variant field (standard|vip_buy)."""
        assert "bonus_variant" in telemetry_content.lower(), (
            "TELEMETRY.md missing bonus_variant field"
        )
        # Verify it distinguishes standard vs vip_buy
        assert re.search(r"standard\|vip_buy|standard.*vip_buy", telemetry_content.lower()), (
            "TELEMETRY.md bonus_variant missing standard|vip_buy values"
        )

    def test_bonus_multiplier_applied_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define bonus_multiplier_applied field."""
        assert "bonus_multiplier_applied" in telemetry_content.lower(), (
            "TELEMETRY.md missing bonus_multiplier_applied field"
        )

    # Hype Mode telemetry fields
    def test_hype_mode_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define hype_mode field."""
        assert re.search(r"hype_mode|hype.*enabled", telemetry_content.lower()), (
            "TELEMETRY.md missing hype_mode field"
        )

    # Mode tracking fields
    def test_mode_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define mode field for spin tracking."""
        assert re.search(r"`mode`|mode.*normal.*turbo", telemetry_content.lower()), (
            "TELEMETRY.md missing mode field"
        )

    # Config hash for reproducibility
    def test_config_hash_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define config_hash field for audit."""
        assert "config_hash" in telemetry_content.lower(), (
            "TELEMETRY.md missing config_hash field"
        )

    # Rage Mode telemetry fields
    def test_rage_active_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define rage_active field."""
        assert "rage_active" in telemetry_content.lower(), (
            "TELEMETRY.md missing rage_active field"
        )

    def test_rage_multiplier_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define rage_multiplier field."""
        assert "rage_multiplier" in telemetry_content.lower(), (
            "TELEMETRY.md missing rage_multiplier field"
        )

    # Spotlight telemetry fields
    def test_spotlight_triggered_field_defined(self, telemetry_content):
        """TELEMETRY.md MUST define spotlight_triggered or spotlight_used field."""
        assert re.search(r"spotlight_triggered|spotlight_used", telemetry_content.lower()), (
            "TELEMETRY.md missing spotlight_triggered/spotlight_used field"
        )

    # Bonus end telemetry for audit
    def test_bonus_end_event_defined(self, telemetry_content):
        """TELEMETRY.md MUST define bonus_end event with required fields."""
        assert "bonus_end" in telemetry_content.lower(), (
            "TELEMETRY.md missing bonus_end event"
        )
        # Verify bonus_end contains total_win_x field
        assert "total_win_x" in telemetry_content.lower(), (
            "TELEMETRY.md bonus_end missing total_win_x field"
        )


class TestLawsConsistency:
    """Cross-validate that laws are consistent across files."""

    @pytest.fixture(scope="class")
    def all_laws(self) -> dict:
        """Load all law files."""
        return {
            "game_rules": (PROJECT_ROOT / "GAME_RULES.md").read_text(),
            "config": (PROJECT_ROOT / "CONFIG.md").read_text(),
            "telemetry": (PROJECT_ROOT / "TELEMETRY.md").read_text(),
        }

    def test_max_win_consistent(self, all_laws):
        """MAX_WIN_TOTAL_X=25000 must be consistent across laws."""
        # Check GAME_RULES.md
        assert "25000" in all_laws["game_rules"], (
            "GAME_RULES.md missing 25000x cap value"
        )
        # Check CONFIG.md
        assert re.search(r"MAX_WIN_TOTAL_X\s*=\s*25000", all_laws["config"]), (
            "CONFIG.md MAX_WIN_TOTAL_X not set to 25000"
        )

    def test_buy_feature_cost_consistent(self, all_laws):
        """BUY_FEATURE_COST_MULTIPLIER=100 must be consistent."""
        # Check CONFIG.md has 100
        assert re.search(r"BUY_FEATURE_COST_MULTIPLIER\s*=\s*100", all_laws["config"]), (
            "CONFIG.md BUY_FEATURE_COST_MULTIPLIER not set to 100"
        )
        # Check GAME_RULES.md references 100x cost
        assert re.search(r"100.*x|100x|100 \*", all_laws["game_rules"], re.IGNORECASE), (
            "GAME_RULES.md missing 100x cost reference for Buy Feature"
        )

    def test_rage_multiplier_consistent(self, all_laws):
        """AFTERPARTY_RAGE_MULTIPLIER must be consistent (x2 minimum per rules)."""
        # Check CONFIG.md
        match = re.search(r"AFTERPARTY_RAGE_MULTIPLIER\s*=\s*(\d+)", all_laws["config"])
        assert match, "CONFIG.md missing AFTERPARTY_RAGE_MULTIPLIER"
        rage_mult = int(match.group(1))
        assert rage_mult >= 2, (
            f"CONFIG.md AFTERPARTY_RAGE_MULTIPLIER={rage_mult} < 2 (violates GAME_RULES.md)"
        )

    def test_hype_mode_cost_increase_consistent(self, all_laws):
        """HYPE_MODE_COST_INCREASE should match rules (+25% per GAME_RULES.md)."""
        # Check CONFIG.md
        match = re.search(r"HYPE_MODE_COST_INCREASE\s*=\s*([\d.]+)", all_laws["config"])
        assert match, "CONFIG.md missing HYPE_MODE_COST_INCREASE"
        cost_inc = float(match.group(1))
        assert cost_inc == 0.25, (
            f"CONFIG.md HYPE_MODE_COST_INCREASE={cost_inc} != 0.25 (GAME_RULES.md says +25%)"
        )
