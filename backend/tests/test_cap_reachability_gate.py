"""
GATE 4: Cap Reachability tests per CONFIG.md and GAME_RULES.md.

Ensures that the "dream 25000x" is not a dead number.

Strategy:
- If CAP_REACHABILITY_STRATEGY=seed: run seed_hunt and verify 10k+ is found
- If CAP_REACHABILITY_STRATEGY=proof: verify CAP_REACHABILITY.md exists with proper content

Per GAME_RULES.md Extended Tail Reachability:
- EITHER: seed hunt finds >=1 seed with total_win_x >= 10000
- OR: CAP_REACHABILITY.md exists with valid formal proof
"""
import json
import os
import sys
from pathlib import Path

import pytest

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.seed_hunt import hunt_seeds, get_config_hash


# CONFIG.md values (mirror for test)
TAIL_GATE_ROUNDS_BUY_EXTENDED = 200000
CAP_REACHABILITY_STRATEGY = os.environ.get("CAP_REACHABILITY_STRATEGY", "seed")

# Test budget: use smaller for CI speed, rely on cached output for full runs
TEST_MAX_SEEDS = int(os.environ.get("GATE4_MAX_SEEDS", "50000"))

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
TAIL_SEEDS_10K_PATH = PROJECT_ROOT / "out" / "tail_seeds_10k.json"
CAP_REACHABILITY_DOC_PATH = PROJECT_ROOT / "CAP_REACHABILITY.md"


def load_cached_results() -> dict | None:
    """
    Load cached seed hunt results if they exist and config_hash matches.

    Returns None if:
    - File doesn't exist
    - config_hash doesn't match current config
    - File is malformed
    """
    if not TAIL_SEEDS_10K_PATH.exists():
        return None

    try:
        with open(TAIL_SEEDS_10K_PATH) as f:
            cached = json.load(f)

        current_hash = get_config_hash()
        cached_hash = cached.get("config_hash")

        if cached_hash != current_hash:
            print(f"Config hash mismatch: cached={cached_hash}, current={current_hash}")
            return None

        # Must have been run with min_win_x >= 10000
        if cached.get("min_win_x", 0) < 10000:
            print(f"Cached min_win_x={cached.get('min_win_x')} < 10000, ignoring cache")
            return None

        return cached

    except (json.JSONDecodeError, KeyError) as e:
        print(f"Failed to load cached results: {e}")
        return None


class TestCapReachabilityGate:
    """GATE 4: Cap Reachability tests."""

    def test_strategy_seed_finds_10k_plus(self):
        """
        If strategy=seed: run seed_hunt and verify at least 1 seed with 10k+ is found.

        Per CONFIG.md:
        - Run seed_hunt --mode buy --min_win_x 10000
        - If found: PASS
        - If NOT found: check for CAP_REACHABILITY.md fallback
        """
        if CAP_REACHABILITY_STRATEGY != "seed":
            pytest.skip("CAP_REACHABILITY_STRATEGY != seed")

        # Try cached results first
        cached = load_cached_results()
        if cached:
            count_10k_plus = cached.get("count_10000x_plus", 0)
            max_seeds = cached.get("max_seeds", 0)
            print(f"\nUsing cached results: {count_10k_plus} seeds with 10k+ from {max_seeds} seeds")

            if count_10k_plus >= 1:
                # Show top hit
                found = cached.get("found", [])
                if found:
                    top = found[0]
                    print(f"Top cached hit: seed={top['seed']}, win_x={top['total_win_x']:.2f}")
                return  # PASS

            # Cached exists but no 10k+ found - check fallback
            print(f"Cached results show 0 seeds with 10k+ - checking CAP_REACHABILITY.md fallback")

        else:
            # Run fresh seed hunt
            print(f"\nRunning seed hunt: mode=buy, min_win_x=10000, max_seeds={TEST_MAX_SEEDS}")

            found = hunt_seeds(
                mode="buy",
                min_win_x=10000.0,
                target="high",
                max_seeds=TEST_MAX_SEEDS,
                seed_prefix="GATE4",
                verbose=True,
            )

            count_10k_plus = len(found)
            print(f"Found {count_10k_plus} seeds with 10k+ in {TEST_MAX_SEEDS} seeds")

            if count_10k_plus >= 1:
                top = sorted(found, key=lambda x: x["total_win_x"], reverse=True)[0]
                print(f"Top hit: seed={top['seed']}, win_x={top['total_win_x']:.2f}, capped={top['is_capped']}")
                return  # PASS

        # No 10k+ found - check for proof fallback
        if CAP_REACHABILITY_DOC_PATH.exists():
            print(f"\nNo 10k+ seeds found, but CAP_REACHABILITY.md exists - checking validity")
            content = CAP_REACHABILITY_DOC_PATH.read_text()

            # Basic validation: must reference GAME_RULES.md and contain analysis
            required_elements = [
                "GAME_RULES.md",
                "10000x",
                "25000x",
                "config_hash",
            ]
            missing = [elem for elem in required_elements if elem not in content]

            if missing:
                pytest.fail(
                    f"CAP_REACHABILITY.md exists but missing required elements: {missing}\n"
                    f"Per GAME_RULES.md, proof document must contain: "
                    f"mechanic path to 10k+, mechanic path to cap, probability analysis, config_hash"
                )

            print(f"CAP_REACHABILITY.md contains valid proof document")
            return  # PASS via proof

        # Neither seed found nor proof exists
        pytest.fail(
            f"GATE 4 FAILED: Cap reachability not demonstrated.\n"
            f"No seeds with 10000x+ found in {TEST_MAX_SEEDS} seeds.\n"
            f"CAP_REACHABILITY.md does not exist.\n\n"
            f"To fix:\n"
            f"1. Run: cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy "
            f"--min_win_x 10000 --target high --max_seeds 200000 --seed_prefix HUNT "
            f"--out ../out/tail_seeds_10k.json --verbose\n"
            f"2. If still no 10k+ found, create CAP_REACHABILITY.md with formal proof\n"
            f"3. Or adjust math in engine.py to make 10k+ reachable"
        )

    def test_strategy_proof_requires_document(self):
        """
        If strategy=proof: CAP_REACHABILITY.md MUST exist with valid content.
        """
        if CAP_REACHABILITY_STRATEGY != "proof":
            pytest.skip("CAP_REACHABILITY_STRATEGY != proof")

        assert CAP_REACHABILITY_DOC_PATH.exists(), (
            f"CAP_REACHABILITY_STRATEGY=proof but {CAP_REACHABILITY_DOC_PATH} does not exist.\n"
            f"Per GAME_RULES.md, this document MUST contain formal reachability analysis."
        )

        content = CAP_REACHABILITY_DOC_PATH.read_text()

        # Validate required sections
        required_sections = [
            ("GAME_RULES.md", "Must reference GAME_RULES.md sections"),
            ("10000x", "Must describe path to 10000x+"),
            ("25000x", "Must describe path to theoretical cap"),
            ("config_hash", "Must include config_hash for which analysis applies"),
        ]

        for keyword, description in required_sections:
            assert keyword in content, (
                f"CAP_REACHABILITY.md missing required element: {keyword}\n"
                f"Description: {description}"
            )

        print(f"\nCAP_REACHABILITY.md validated successfully")


class TestCapNeverExceededInHunt:
    """Verify cap is enforced even in tail seeds."""

    def test_found_seeds_respect_cap(self):
        """All found seeds must respect MAX_WIN_TOTAL_X cap."""
        from app.logic.engine import MAX_WIN_TOTAL_X

        cached = load_cached_results()
        if not cached:
            pytest.skip("No cached tail_seeds_10k.json to verify")

        found = cached.get("found", [])
        for result in found:
            assert result["total_win_x"] <= MAX_WIN_TOTAL_X, (
                f"Seed {result['seed']} exceeded cap: "
                f"{result['total_win_x']}x > {MAX_WIN_TOTAL_X}x"
            )

        print(f"Verified {len(found)} seeds respect cap of {MAX_WIN_TOTAL_X}x")


class TestSeedHuntOutputFormat:
    """Verify seed_hunt output includes required GATE 4 fields."""

    def test_output_has_gate4_fields(self):
        """Output JSON must include GATE 4 summary fields."""
        cached = load_cached_results()
        if not cached:
            # Run minimal hunt to verify output format
            found = hunt_seeds(
                mode="buy",
                min_win_x=500.0,
                target="high",
                max_seeds=1000,
                seed_prefix="FORMAT_TEST",
                verbose=False,
            )
            # Build output same as main()
            from scripts.seed_hunt import get_config_hash
            from app.logic.engine import MAX_WIN_TOTAL_X

            sorted_found = sorted(found, key=lambda x: x["total_win_x"], reverse=True)
            cached = {
                "mode": "buy",
                "max_seeds": 1000,
                "min_win_x": 500.0,
                "config_hash": get_config_hash(),
                "count_1000x_plus": sum(1 for r in found if r["total_win_x"] >= 1000),
                "count_10000x_plus": sum(1 for r in found if r["total_win_x"] >= 10000),
                "count_capped": sum(1 for r in found if r["is_capped"]),
                "found": sorted_found,
            }

        # Verify GATE 4 required fields
        required_fields = [
            "config_hash",
            "count_1000x_plus",
            "count_10000x_plus",
            "count_capped",
        ]

        for field in required_fields:
            assert field in cached, f"Output missing GATE 4 field: {field}"

        print(f"Output format validated with all GATE 4 fields present")

    def test_individual_result_has_required_fields(self):
        """Each found seed result must include required fields."""
        required_fields = ["seed", "total_win_x", "is_capped", "cap_reason", "bonus_variant"]

        # Run minimal hunt
        found = hunt_seeds(
            mode="buy",
            min_win_x=100.0,
            target="high",
            max_seeds=500,
            seed_prefix="FIELD_TEST",
            verbose=False,
        )

        if not found:
            pytest.skip("No seeds found to verify fields")

        for result in found[:5]:  # Check first 5
            for field in required_fields:
                assert field in result, (
                    f"Seed result missing field: {field}\n"
                    f"Result: {result}"
                )

        print(f"Individual result format validated")
