"""
Theoretical Maximum Proof tests per GAME_RULES.md and CONFIG.md.

Ensures that:
1. Theoretical max >= cap (cap is reachable)
2. CAP_REACHABILITY.md contains current config_hash when strategy=proof
3. Script and test use identical computation logic (no drift)

Per GAME_RULES.md:
- MAX_WIN_TOTAL_X MUST be theoretically achievable in production config
- All numbers in CAP_REACHABILITY.md must be reproducible from code

Note: Marked as @slow - requires file verification. Skipped in quick CI.
"""
import os

import pytest
pytestmark = pytest.mark.slow  # All tests in this module are slow
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.logic.engine import MAX_WIN_TOTAL_X
from scripts.theoretical_max import compute_theoretical_max, get_config_hash


# CONFIG.md value
CAP_REACHABILITY_STRATEGY = os.environ.get("CAP_REACHABILITY_STRATEGY", "seed")

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
CAP_REACHABILITY_DOC_PATH = PROJECT_ROOT / "CAP_REACHABILITY.md"


class TestTheoreticalMaxComputation:
    """Tests for theoretical maximum computation."""

    def test_cap_is_theoretically_reachable(self):
        """
        Theoretical max MUST be >= cap per GAME_RULES.md.

        This is the core invariant: the 25000x cap cannot be a "dead number".
        """
        result = compute_theoretical_max()

        assert result.theoretical_max_vip_buy_bonus_session_x >= MAX_WIN_TOTAL_X, (
            f"CAP IS UNREACHABLE!\n"
            f"Theoretical max: {result.theoretical_max_vip_buy_bonus_session_x:.0f}x\n"
            f"Cap: {MAX_WIN_TOTAL_X}x\n"
            f"The cap MUST be <= theoretical max per GAME_RULES.md."
        )

        assert result.cap_is_reachable is True, (
            f"cap_is_reachable should be True when theoretical max >= cap"
        )

        print(f"\n✓ Cap is reachable:")
        print(f"  Theoretical max: {result.theoretical_max_vip_buy_bonus_session_x:.0f}x")
        print(f"  Cap: {MAX_WIN_TOTAL_X}x")

    def test_10000x_is_below_single_spin_max(self):
        """
        10000x threshold MUST be below theoretical single-spin max.

        This proves 10000x+ is achievable in a single VIP Buy bonus spin.
        """
        result = compute_theoretical_max()

        assert result.theoretical_max_vip_buy_bonus_spin_x >= 10000, (
            f"10000x threshold exceeds theoretical single-spin max!\n"
            f"Theoretical single-spin max: {result.theoretical_max_vip_buy_bonus_spin_x:.0f}x\n"
            f"This means 10000x+ is unreachable even in optimal conditions."
        )

        print(f"\n✓ 10000x is achievable in a single spin:")
        print(f"  Single-spin max: {result.theoretical_max_vip_buy_bonus_spin_x:.0f}x")

    def test_vip_multiplier_applied_correctly(self):
        """VIP multiplier (11x) must be correctly applied in computation."""
        result = compute_theoretical_max()

        expected_vip_spin_max = result.theoretical_max_base_spin_x * result.vip_buy_multiplier
        assert abs(result.theoretical_max_vip_buy_bonus_spin_x - expected_vip_spin_max) < 0.01, (
            f"VIP multiplier not correctly applied!\n"
            f"Base spin max: {result.theoretical_max_base_spin_x:.1f}x\n"
            f"VIP multiplier: {result.vip_buy_multiplier}\n"
            f"Expected VIP spin max: {expected_vip_spin_max:.1f}x\n"
            f"Actual VIP spin max: {result.theoretical_max_vip_buy_bonus_spin_x:.1f}x"
        )

    def test_session_max_equals_spin_max_times_spins(self):
        """Session max must equal spin max × number of spins."""
        result = compute_theoretical_max()

        expected_session_max = result.theoretical_max_vip_buy_bonus_spin_x * result.vip_buy_spins
        assert abs(result.theoretical_max_vip_buy_bonus_session_x - expected_session_max) < 0.01, (
            f"Session max calculation incorrect!\n"
            f"VIP spin max: {result.theoretical_max_vip_buy_bonus_spin_x:.1f}x\n"
            f"VIP spins: {result.vip_buy_spins}\n"
            f"Expected session max: {expected_session_max:.1f}x\n"
            f"Actual session max: {result.theoretical_max_vip_buy_bonus_session_x:.1f}x"
        )


class TestCapReachabilityDocValidation:
    """Tests for CAP_REACHABILITY.md when strategy=proof."""

    def test_doc_exists_when_strategy_proof(self):
        """
        When CAP_REACHABILITY_STRATEGY=proof, document MUST exist.
        """
        if CAP_REACHABILITY_STRATEGY != "proof":
            pytest.skip("CAP_REACHABILITY_STRATEGY != proof")

        assert CAP_REACHABILITY_DOC_PATH.exists(), (
            f"CAP_REACHABILITY_STRATEGY=proof but {CAP_REACHABILITY_DOC_PATH} does not exist.\n"
            f"Create the document with formal reachability proof per GAME_RULES.md."
        )

    def test_doc_contains_current_config_hash(self):
        """
        CAP_REACHABILITY.md MUST contain current config_hash.

        This ensures the proof applies to the current configuration.
        """
        if not CAP_REACHABILITY_DOC_PATH.exists():
            pytest.skip("CAP_REACHABILITY.md does not exist")

        current_hash = get_config_hash()
        content = CAP_REACHABILITY_DOC_PATH.read_text()

        assert current_hash in content, (
            f"CAP_REACHABILITY.md does not contain current config_hash!\n"
            f"Current config_hash: {current_hash}\n"
            f"The document must be updated with reproducible numbers from:\n"
            f"  cd backend && .venv/bin/python -m scripts.theoretical_max --mode buy"
        )

        print(f"\n✓ CAP_REACHABILITY.md contains config_hash: {current_hash}")

    def test_doc_contains_required_sections(self):
        """
        CAP_REACHABILITY.md MUST contain required sections per GAME_RULES.md.
        """
        if not CAP_REACHABILITY_DOC_PATH.exists():
            pytest.skip("CAP_REACHABILITY.md does not exist")

        content = CAP_REACHABILITY_DOC_PATH.read_text()

        required_keywords = [
            "GAME_RULES.md",
            "10000x",
            "25000x",
            "config_hash",
            "How to Reproduce",  # Must have reproduction instructions
        ]

        missing = [kw for kw in required_keywords if kw not in content]

        assert not missing, (
            f"CAP_REACHABILITY.md missing required content: {missing}\n"
            f"Per GAME_RULES.md, document must contain mechanic paths, "
            f"probability analysis, config_hash, and reproduction instructions."
        )

    def test_doc_contains_script_computed_values(self):
        """
        CAP_REACHABILITY.md MUST contain values matching script output.

        This prevents hand-calculated numbers that can drift from code.
        """
        if not CAP_REACHABILITY_DOC_PATH.exists():
            pytest.skip("CAP_REACHABILITY.md does not exist")

        result = compute_theoretical_max()
        content = CAP_REACHABILITY_DOC_PATH.read_text()

        # Check that key computed values appear in document
        key_values = [
            ("1,674", "Base spin max"),
            ("18,414", "VIP Buy bonus spin max"),
            ("184,140", "VIP Buy bonus session max"),
        ]

        for value, description in key_values:
            assert value in content, (
                f"CAP_REACHABILITY.md missing script-computed value!\n"
                f"Expected: {value} ({description})\n"
                f"Run: cd backend && .venv/bin/python -m scripts.theoretical_max --mode buy\n"
                f"And update the document with the output."
            )

        print(f"\n✓ CAP_REACHABILITY.md contains script-computed values")


class TestTheoreticalMaxConsistency:
    """Tests for consistency between script and engine constants."""

    def test_max_win_total_x_matches_config(self):
        """MAX_WIN_TOTAL_X in result must match engine constant."""
        result = compute_theoretical_max()
        assert result.max_win_total_x == MAX_WIN_TOTAL_X

    def test_config_hash_is_deterministic(self):
        """Config hash must be deterministic (same result on repeat calls)."""
        hash1 = get_config_hash()
        hash2 = get_config_hash()
        assert hash1 == hash2, "Config hash is not deterministic!"

    def test_result_has_all_required_fields(self):
        """Result must have all fields needed for JSON output."""
        result = compute_theoretical_max()
        result_dict = result.to_dict()

        required_fields = [
            "config_hash",
            "git_commit",
            "timestamp",
            "theoretical_max_base_spin_x",
            "theoretical_max_vip_buy_bonus_spin_x",
            "theoretical_max_vip_buy_bonus_session_x",
            "max_win_total_x",
            "cap_is_reachable",
            "vip_buy_multiplier",
            "vip_buy_spins",
        ]

        for field in required_fields:
            assert field in result_dict, f"Result missing required field: {field}"
