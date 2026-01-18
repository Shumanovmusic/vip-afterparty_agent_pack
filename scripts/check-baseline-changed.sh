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

# =============================================================================
# ALLOWLIST: Paths that justify baseline changes
# =============================================================================
# If a baseline file changes, at least ONE of these paths must also change.
# This prevents accidental baseline regeneration from unrelated changes.
#
# Categories:
#   1. Engine/math code
#   2. Configuration files
#   3. Laws/spec documentation
#   4. Audit/simulation scripts (that generate baselines)
#   5. Makefile (canonical param definitions)
# =============================================================================
ALLOWLIST_PATHS=(
    # Engine/math code
    "backend/app/logic/"
    "backend/app/config.py"

    # Audit/simulation scripts
    "backend/scripts/audit_sim.py"
    "backend/scripts/diff_audit.py"
    "backend/scripts/tail_progression.py"

    # Laws/spec documentation
    "CONFIG.md"
    "GAME_RULES.md"
    "TELEMETRY.md"
    "LAWS_INDEX.md"
    "CAP_REACHABILITY.md"
    "RNG_POLICY.md"

    # Build system (canonical param definitions)
    "Makefile"
)

# =============================================================================
# BASELINE FILES: Canonical snapshots that require policy enforcement
# =============================================================================
BASELINE_FILES=(
    "out/audit_base_gate.csv"
    "out/audit_buy_gate.csv"
    "out/audit_hype_gate.csv"
    "out/tail_baseline_buy_gate.csv"
)

# =============================================================================
# CANONICAL PARAMETERS: Expected values for each baseline file
# =============================================================================
# Function to get expected params for a file
# Returns: "mode:seed:rounds"
get_canonical_params() {
    local file="$1"
    case "$file" in
        "out/audit_base_gate.csv") echo "base:AUDIT_2025:20000" ;;
        "out/audit_buy_gate.csv") echo "buy:AUDIT_2025:20000" ;;
        "out/audit_hype_gate.csv") echo "hype:AUDIT_2025:20000" ;;
        "out/tail_baseline_buy_gate.csv") echo "buy:AUDIT_2025:20000" ;;
        *) echo "" ;;
    esac
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================
CHECK_MODE="staged"  # Default: check staged changes
BASE_BRANCH=""
SKIP_PARAM_VALIDATION=0

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
        --skip-param-validation)
            SKIP_PARAM_VALIDATION=1
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--all|--branch <branch>] [--skip-param-validation]"
            echo "  (default)              Check staged changes"
            echo "  --all                  Check all uncommitted changes"
            echo "  --branch X             Compare current HEAD against branch X (for CI)"
            echo "  --skip-param-validation  Skip CSV parameter validation (for testing)"
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

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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

# Check if a changed file matches any allowlist path (prefix match)
matches_allowlist() {
    local file="$1"
    for pattern in "${ALLOWLIST_PATHS[@]}"; do
        # Prefix match: file starts with pattern
        if [[ "$file" == "$pattern"* ]]; then
            return 0
        fi
    done
    return 1
}

# Validate canonical parameters in a CSV file
validate_canonical_params() {
    local csv_file="$1"
    local expected
    expected=$(get_canonical_params "$csv_file")

    if [ -z "$expected" ]; then
        echo "  WARNING: No canonical params defined for $csv_file"
        return 0
    fi

    # Parse expected values
    local expected_mode expected_seed expected_rounds
    IFS=':' read -r expected_mode expected_seed expected_rounds <<< "$expected"

    # Check if file exists
    if [ ! -f "$csv_file" ]; then
        echo "  ERROR: File not found: $csv_file"
        return 1
    fi

    # Read CSV header and first data row
    local header data_row
    header=$(head -1 "$csv_file")
    data_row=$(sed -n '2p' "$csv_file")

    if [ -z "$data_row" ]; then
        echo "  ERROR: No data row in $csv_file"
        return 1
    fi

    # Find column indices by parsing header
    local mode_idx=-1 seed_idx=-1 rounds_idx=-1 config_hash_idx=-1
    local col_idx=0

    # Save and set IFS for parsing
    local OLD_IFS="$IFS"
    IFS=','

    for col in $header; do
        case "$col" in
            mode) mode_idx=$col_idx ;;
            seed) seed_idx=$col_idx ;;
            rounds) rounds_idx=$col_idx ;;
            config_hash) config_hash_idx=$col_idx ;;
        esac
        col_idx=$((col_idx + 1))
    done

    # Validate we found required columns
    if [ $mode_idx -eq -1 ] || [ $seed_idx -eq -1 ] || [ $rounds_idx -eq -1 ] || [ $config_hash_idx -eq -1 ]; then
        IFS="$OLD_IFS"
        echo "  ERROR: Missing required columns in $csv_file"
        echo "         Found: mode_idx=$mode_idx seed_idx=$seed_idx rounds_idx=$rounds_idx config_hash_idx=$config_hash_idx"
        return 1
    fi

    # Parse data row into array
    col_idx=0
    local actual_mode="" actual_seed="" actual_rounds="" actual_config_hash=""

    for val in $data_row; do
        if [ $col_idx -eq $mode_idx ]; then actual_mode="$val"; fi
        if [ $col_idx -eq $seed_idx ]; then actual_seed="$val"; fi
        if [ $col_idx -eq $rounds_idx ]; then actual_rounds="$val"; fi
        if [ $col_idx -eq $config_hash_idx ]; then actual_config_hash="$val"; fi
        col_idx=$((col_idx + 1))
    done

    IFS="$OLD_IFS"

    local errors=0

    # Validate mode
    if [ "$actual_mode" != "$expected_mode" ]; then
        echo "  ERROR: mode mismatch in $csv_file"
        echo "         Expected: $expected_mode, Got: $actual_mode"
        errors=$((errors + 1))
    fi

    # Validate seed
    if [ "$actual_seed" != "$expected_seed" ]; then
        echo "  ERROR: seed mismatch in $csv_file"
        echo "         Expected: $expected_seed, Got: $actual_seed"
        errors=$((errors + 1))
    fi

    # Validate rounds
    if [ "$actual_rounds" != "$expected_rounds" ]; then
        echo "  ERROR: rounds mismatch in $csv_file"
        echo "         Expected: $expected_rounds, Got: $actual_rounds"
        errors=$((errors + 1))
    fi

    # Validate config_hash is non-empty
    if [ -z "$actual_config_hash" ]; then
        echo "  ERROR: config_hash is empty in $csv_file"
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        return 1
    fi

    echo "  OK: $csv_file (mode=$actual_mode, seed=$actual_seed, rounds=$actual_rounds, config_hash=$actual_config_hash)"
    return 0
}

# =============================================================================
# MAIN LOGIC
# =============================================================================

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

for baseline in "${BASELINE_FILES[@]}"; do
    if echo "$CHANGED_FILES" | grep -qF "$baseline"; then
        BASELINE_CHANGED=1
        CHANGED_BASELINES+=("$baseline")
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

# =============================================================================
# CHECK 1: Validate canonical parameters in changed baseline files
# =============================================================================
if [ $SKIP_PARAM_VALIDATION -eq 0 ]; then
    echo "Validating canonical parameters..."
    PARAM_ERRORS=0

    for baseline in "${CHANGED_BASELINES[@]}"; do
        if ! validate_canonical_params "$baseline"; then
            PARAM_ERRORS=$((PARAM_ERRORS + 1))
        fi
    done

    if [ $PARAM_ERRORS -gt 0 ]; then
        echo ""
        echo "ERROR: Canonical parameter validation failed!"
        echo ""
        echo "Baseline files must use these canonical parameters:"
        echo "  - seed: AUDIT_2025"
        echo "  - rounds: 20000"
        echo "  - mode: must match filename (audit_base_gate.csv => base, etc.)"
        echo "  - config_hash: must be present and non-empty"
        echo ""
        echo "Regenerate with: make audit-gate-snapshots"
        echo ""
        echo "=== Baseline Update Policy Check FAILED ==="
        exit 1
    fi
    echo ""
fi

# =============================================================================
# CHECK 2: Verify at least one allowlisted path also changed
# =============================================================================
echo "Checking for allowlisted justifying changes..."

ALLOWLIST_MATCHED=0
MATCHED_PATHS=()

while IFS= read -r file; do
    if [ -n "$file" ] && matches_allowlist "$file"; then
        ALLOWLIST_MATCHED=1
        MATCHED_PATHS+=("$file")
    fi
done <<< "$CHANGED_FILES"

if [ $ALLOWLIST_MATCHED -eq 1 ]; then
    echo "Allowlisted justifying changes detected:"
    for path in "${MATCHED_PATHS[@]}"; do
        echo "  - $path"
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

# =============================================================================
# FAIL: Baseline changed without allowlisted justifying changes
# =============================================================================
echo ""
echo "ERROR: Baseline files changed WITHOUT allowlisted justifying changes!"
echo ""
echo "Baseline Update Policy requires at least one of these paths to also change:"
echo ""
echo "  Engine/math code:"
echo "    - backend/app/logic/**"
echo "    - backend/app/config.py"
echo ""
echo "  Audit/simulation scripts:"
echo "    - backend/scripts/audit_sim.py"
echo "    - backend/scripts/diff_audit.py"
echo "    - backend/scripts/tail_progression.py"
echo ""
echo "  Laws/spec documentation:"
echo "    - CONFIG.md"
echo "    - GAME_RULES.md"
echo "    - TELEMETRY.md"
echo "    - LAWS_INDEX.md"
echo "    - CAP_REACHABILITY.md"
echo "    - RNG_POLICY.md"
echo ""
echo "  Build system:"
echo "    - Makefile"
echo ""
echo "This check prevents accidental baseline regeneration."
echo ""
echo "If this is an intentional rebaseline:"
echo "  1. Ensure game math/config actually changed"
echo "  2. If it did, include those changes in this commit"
echo "  3. See BASELINE_POLICY.md for full requirements"
echo ""
echo "=== Baseline Update Policy Check FAILED ==="
exit 1
