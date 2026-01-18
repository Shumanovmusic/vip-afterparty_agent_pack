"""
Test Afterparty Meter config consistency.

Ensures that settings values match CONFIG.md and that engine uses settings.
This is a regression guard to prevent value drift between CONFIG.md and code.

Source of Truth: CONFIG.md
"""
import pytest

from app.config import settings
from app.logic import engine


class TestAfterpartyConfigSettings:
    """Test that settings exposes the correct CONFIG.md values."""

    def test_meter_inc_on_any_win(self):
        """AFTERPARTY_METER_INC_ON_ANY_WIN = 3"""
        assert settings.afterparty_meter_inc_on_any_win == 3

    def test_meter_inc_on_wild_present(self):
        """AFTERPARTY_METER_INC_ON_WILD_PRESENT = 5"""
        assert settings.afterparty_meter_inc_on_wild_present == 5

    def test_meter_inc_on_two_scatters(self):
        """AFTERPARTY_METER_INC_ON_TWO_SCATTERS = 8"""
        assert settings.afterparty_meter_inc_on_two_scatters == 8

    def test_rage_cooldown_spins(self):
        """AFTERPARTY_RAGE_COOLDOWN_SPINS = 15"""
        assert settings.afterparty_rage_cooldown_spins == 15

    def test_meter_max(self):
        """AFTERPARTY_METER_MAX = 100"""
        assert settings.afterparty_meter_max == 100

    def test_rage_spins(self):
        """AFTERPARTY_RAGE_SPINS = 3"""
        assert settings.afterparty_rage_spins == 3

    def test_rage_multiplier(self):
        """AFTERPARTY_RAGE_MULTIPLIER = 2"""
        assert settings.afterparty_rage_multiplier == 2

    def test_enable_afterparty_meter(self):
        """ENABLE_AFTERPARTY_METER = ON (True)"""
        assert settings.enable_afterparty_meter is True


class TestAfterpartyEngineUsesSettings:
    """Test that engine module uses settings, not hardcoded values."""

    def test_engine_meter_inc_on_any_win_from_settings(self):
        """Engine's AFTERPARTY_METER_INC_ON_ANY_WIN must come from settings."""
        assert engine.AFTERPARTY_METER_INC_ON_ANY_WIN == settings.afterparty_meter_inc_on_any_win

    def test_engine_meter_inc_on_wild_present_from_settings(self):
        """Engine's AFTERPARTY_METER_INC_ON_WILD_PRESENT must come from settings."""
        assert engine.AFTERPARTY_METER_INC_ON_WILD_PRESENT == settings.afterparty_meter_inc_on_wild_present

    def test_engine_meter_inc_on_two_scatters_from_settings(self):
        """Engine's AFTERPARTY_METER_INC_ON_TWO_SCATTERS must come from settings."""
        assert engine.AFTERPARTY_METER_INC_ON_TWO_SCATTERS == settings.afterparty_meter_inc_on_two_scatters

    def test_engine_cooldown_from_settings(self):
        """Engine's AFTERPARTY_RAGE_COOLDOWN_SPINS must come from settings."""
        assert engine.AFTERPARTY_RAGE_COOLDOWN_SPINS == settings.afterparty_rage_cooldown_spins

    def test_engine_meter_max_from_settings(self):
        """Engine's AFTERPARTY_METER_MAX must come from settings."""
        assert engine.AFTERPARTY_METER_MAX == settings.afterparty_meter_max

    def test_engine_rage_spins_from_settings(self):
        """Engine's AFTERPARTY_RAGE_SPINS must come from settings."""
        assert engine.AFTERPARTY_RAGE_SPINS == settings.afterparty_rage_spins

    def test_engine_rage_multiplier_from_settings(self):
        """Engine's AFTERPARTY_RAGE_MULTIPLIER must come from settings."""
        assert engine.AFTERPARTY_RAGE_MULTIPLIER == settings.afterparty_rage_multiplier


class TestAfterpartyValuesAreCorrect:
    """
    Canonical value assertions per CONFIG.md.

    If these fail, either CONFIG.md changed or code drifted.
    Update both together, never just one.
    """

    def test_canonical_increment_values(self):
        """The tuned increment values: 3, 5, 8 (not 10, 15, 20)."""
        assert engine.AFTERPARTY_METER_INC_ON_ANY_WIN == 3, "Should be 3, not 10"
        assert engine.AFTERPARTY_METER_INC_ON_WILD_PRESENT == 5, "Should be 5, not 15"
        assert engine.AFTERPARTY_METER_INC_ON_TWO_SCATTERS == 8, "Should be 8, not 20"

    def test_canonical_cooldown_value(self):
        """The tuned cooldown: 15 spins (not 10)."""
        assert engine.AFTERPARTY_RAGE_COOLDOWN_SPINS == 15, "Should be 15, not 10"
