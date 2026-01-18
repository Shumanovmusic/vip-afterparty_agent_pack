"""Laws sync validation tests per CLAUDE.md contract."""
import pytest

from scripts.check_laws_sync import parse_config_md, get_code_values, check_sync


class TestLawsSync:
    """Test CONFIG.md values match code implementation."""

    def test_config_md_parseable(self):
        """CONFIG.md must exist and be parseable."""
        config = parse_config_md()
        assert isinstance(config, dict)
        assert len(config) > 0

    def test_max_win_total_x_in_config(self):
        """MAX_WIN_TOTAL_X must be defined in CONFIG.md."""
        config = parse_config_md()
        assert "MAX_WIN_TOTAL_X" in config
        assert config["MAX_WIN_TOTAL_X"] == 25000

    def test_buy_feature_cost_multiplier_in_config(self):
        """BUY_FEATURE_COST_MULTIPLIER must be defined in CONFIG.md."""
        config = parse_config_md()
        assert "BUY_FEATURE_COST_MULTIPLIER" in config
        assert config["BUY_FEATURE_COST_MULTIPLIER"] == 100

    def test_code_values_accessible(self):
        """Code values must be importable."""
        code = get_code_values()
        assert isinstance(code, dict)
        assert "MAX_WIN_TOTAL_X" in code
        assert "BUY_FEATURE_COST_MULTIPLIER" in code

    def test_max_win_matches_code(self):
        """MAX_WIN_TOTAL_X must match in CONFIG.md and code."""
        config = parse_config_md()
        code = get_code_values()
        assert config["MAX_WIN_TOTAL_X"] == code["MAX_WIN_TOTAL_X"]
        assert config["MAX_WIN_TOTAL_X"] == code["MAX_WIN_TOTAL_X_ENGINE"]

    def test_hype_mode_matches_code(self):
        """HYPE_MODE_COST_INCREASE must match in CONFIG.md and code."""
        config = parse_config_md()
        code = get_code_values()
        assert abs(config["HYPE_MODE_COST_INCREASE"] - code["HYPE_MODE_COST_INCREASE"]) < 0.0001

    def test_afterparty_meter_matches_code(self):
        """AFTERPARTY_METER_MAX must match in CONFIG.md and code."""
        config = parse_config_md()
        code = get_code_values()
        assert config["AFTERPARTY_METER_MAX"] == code["AFTERPARTY_METER_MAX"]

    def test_afterparty_rage_matches_code(self):
        """AFTERPARTY_RAGE_* values must match in CONFIG.md and code."""
        config = parse_config_md()
        code = get_code_values()
        assert config["AFTERPARTY_RAGE_SPINS"] == code["AFTERPARTY_RAGE_SPINS"]
        assert config["AFTERPARTY_RAGE_MULTIPLIER"] == code["AFTERPARTY_RAGE_MULTIPLIER"]

    def test_no_sync_mismatches(self):
        """Full sync check must pass with no mismatches."""
        mismatches = check_sync()
        if mismatches:
            msg = "Laws sync failed:\n"
            for key, config_val, code_val in mismatches:
                msg += f"  {key}: CONFIG.md={config_val}, code={code_val}\n"
            pytest.fail(msg)
