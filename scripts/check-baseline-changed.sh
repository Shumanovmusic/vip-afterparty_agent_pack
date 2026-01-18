#!/usr/bin/env bash
# Baseline Update Policy enforcement script.
# Fails if baseline files changed without accompanying engine/config/laws changes.
# Part of the pre-commit / make gate pipeline.
#
# Usage:
#   ./scripts/check-baseline-changed.sh              # Check staged changes
#   ./scripts/check-baseline-changed.sh --all        # Check all uncommitted changes
#   ./scripts/check-baseline-changed.sh --branch main  # Compare against branch (for CI)
#
# See BASELINE_POLICY.md for full policy documentation.

set -euo pipefail

# Parse arguments
CHECK_MODE="staged"  # Default: check staged changes
BASE_BRANCH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            CHECK_MODE="all"
            shift
            ;;
        --branch)
            CHECK_MODE="branch"
            BASE_BRANCH="${2:-main}"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--all|--branch <branch>]"
            echo "  (default)     Check staged changes"
            echo "  --all         Check all uncommitted changes"
            echo "  --branch X    Compare current HEAD against branch X (for CI)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=== Baseline Update Policy Check ==="
echo "Mode: $CHECK_MODE"
echo ""

# Define baseline files (patterns)
BASELINE_PATTERNS=(
    "out/audit_base_gate.csv"
    "out/audit_buy_gate.csv"
    "out/audit_hype_gate.csv"
    "out/tail_baseline_buy_gate.csv"
)

# Define required accompanying files (if baseline changes, at least one of these must also change)
REQUIRED_CHANGE_PATTERNS=(
    "backend/app/config.py"
    "backend/app/logic/engine.py"
    "CONFIG.md"
    "GAME_RULES.md"
    "RNG_POLICY.md"
)

# Get list of changed files based on mode
get_changed_files() {
    case $CHECK_MODE in
        staged)
            git diff --cached --name-only 2>/dev/null || true
            ;;
        all)
            git diff --name-only 2>/dev/null || true
            git diff --cached --name-only 2>/dev/null || true
            ;;
        branch)
            git diff --name-only "${BASE_BRANCH}...HEAD" 2>/dev/null || true
            ;;
    esac
}

CHANGED_FILES=$(get_changed_files | sort -u)

if [ -z "$CHANGED_FILES" ]; then
    echo "No changed files detected."
    echo ""
    echo "=== Baseline Update Policy Check PASSED ==="
    exit 0
fi

# Check if any baseline files changed
BASELINE_CHANGED=0
CHANGED_BASELINES=()

for pattern in "${BASELINE_PATTERNS[@]}"; do
    if echo "$CHANGED_FILES" | grep -qF "$pattern"; then
        BASELINE_CHANGED=1
        CHANGED_BASELINES+=("$pattern")
    fi
done

if [ $BASELINE_CHANGED -eq 0 ]; then
    echo "No baseline files changed."
    echo ""
    echo "=== Baseline Update Policy Check PASSED ==="
    exit 0
fi

echo "Baseline files changed:"
for baseline in "${CHANGED_BASELINES[@]}"; do
    echo "  - $baseline"
done
echo ""

# Check if any required accompanying files also changed
REQUIRED_CHANGED=0
CHANGED_REQUIRED=()

for pattern in "${REQUIRED_CHANGE_PATTERNS[@]}"; do
    if echo "$CHANGED_FILES" | grep -qF "$pattern"; then
        REQUIRED_CHANGED=1
        CHANGED_REQUIRED+=("$pattern")
    fi
done

if [ $REQUIRED_CHANGED -eq 1 ]; then
    echo "Accompanying engine/config/laws changes detected:"
    for req in "${CHANGED_REQUIRED[@]}"; do
        echo "  - $req"
    done
    echo ""
    echo "=== Baseline Update Policy Check PASSED ==="
    echo ""
    echo "NOTE: Ensure your PR includes:"
    echo "  1. Justification for baseline change"
    echo "  2. make gate output showing PASS"
    echo "  3. diff-audit-compare results"
    echo "  4. Before/after metric comparison"
    echo ""
    echo "See BASELINE_POLICY.md for full requirements."
    exit 0
fi

# FAIL: Baseline changed without required accompanying changes
echo "ERROR: Baseline files changed WITHOUT required accompanying changes!"
echo ""
echo "Baseline Update Policy requires at least one of these files to also change:"
for pattern in "${REQUIRED_CHANGE_PATTERNS[@]}"; do
    echo "  - $pattern"
done
echo ""
echo "This check prevents accidental baseline regeneration."
echo ""
echo "If this is an intentional rebaseline:"
echo "  1. Ensure game math/config actually changed"
echo "  2. If it did, include those changes in this commit"
echo "  3. See BASELINE_POLICY.md for full requirements"
echo ""
echo "If you're just regenerating to sync (same math):"
echo "  - This should not change baselines (deterministic)"
echo "  - If baselines changed, investigate why config_hash differs"
echo ""
echo "=== Baseline Update Policy Check FAILED ==="
exit 1
