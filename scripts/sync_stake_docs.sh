#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/stake_docs/library/api"
mkdir -p "$OUT"

fetch () {
  local name="$1"
  local url="$2"
  echo "==> $name"

  # Use Jina Reader as primary method (handles JS-rendered pages)
  local jina_url="https://r.jina.ai/${url}"

  if curl -fsSL --max-time 30 "$jina_url" -o "$OUT/$name.md.tmp" 2>/dev/null; then
    # Check if we got meaningful content
    if grep -qiE "(approval|rgs|wallet|math|frontend|protocol|guidelines|Stake|game|spin)" "$OUT/$name.md.tmp" 2>/dev/null; then
      tr -d '\r' < "$OUT/$name.md.tmp" > "$OUT/$name.md"
      rm -f "$OUT/$name.md.tmp"
      echo "    OK: $name.md"
      return 0
    fi
  fi

  # Fallback: try direct curl
  if curl -fsSL --max-time 30 "$url" -o "$OUT/$name.md.tmp" 2>/dev/null; then
    if grep -qiE "(approval|rgs|wallet|math|frontend|protocol|guidelines|Stake|game|spin)" "$OUT/$name.md.tmp" 2>/dev/null; then
      tr -d '\r' < "$OUT/$name.md.tmp" > "$OUT/$name.md"
      rm -f "$OUT/$name.md.tmp"
      echo "    OK (direct): $name.md"
      return 0
    fi
  fi

  rm -f "$OUT/$name.md.tmp"
  echo "    FAILED: $name" >&2
  return 1
}

# Write source URLs as SoT
cat > "$ROOT/stake_docs/SOURCE_URLS.txt" <<'TXT'
https://stake-engine.com/docs
https://stake-engine.com/docs/approval-guidelines
https://stake-engine.com/docs/approval-guidelines/front-end-communication
https://stake-engine.com/docs/approval-guidelines/rgs-communication
https://stake-engine.com/docs/approval-guidelines/jurisdiction-requirements
https://stake-engine.com/docs/approval-guidelines/general-disclaimer
https://stake-engine.com/docs/rgs
https://stake-engine.com/docs/rgs/wallet
https://stake-engine.com/docs/rgs/example
https://stake-engine.com/docs/math
https://stake-engine.com/docs/math/setup
https://stake-engine.com/docs/math/quick-start
https://stake-engine.com/docs/math/optimization-algorithm
https://stake-engine.com/docs/math/high-level-structure/game-format
https://stake-engine.com/docs/math/source-files/outputs
https://stake-engine.com/docs/front-end
TXT

echo "Syncing Stake Engine docs..."
echo ""

FAILED=()

fetch "stake_docs_index" "https://stake-engine.com/docs" || FAILED+=("stake_docs_index")
fetch "approval_guidelines" "https://stake-engine.com/docs/approval-guidelines" || FAILED+=("approval_guidelines")
fetch "approval_frontend_communication" "https://stake-engine.com/docs/approval-guidelines/front-end-communication" || FAILED+=("approval_frontend_communication")
fetch "approval_rgs_communication" "https://stake-engine.com/docs/approval-guidelines/rgs-communication" || FAILED+=("approval_rgs_communication")
fetch "approval_jurisdiction_requirements" "https://stake-engine.com/docs/approval-guidelines/jurisdiction-requirements" || FAILED+=("approval_jurisdiction_requirements")
fetch "approval_general_disclaimer" "https://stake-engine.com/docs/approval-guidelines/general-disclaimer" || FAILED+=("approval_general_disclaimer")

fetch "rgs" "https://stake-engine.com/docs/rgs" || FAILED+=("rgs")
fetch "rgs_wallet" "https://stake-engine.com/docs/rgs/wallet" || FAILED+=("rgs_wallet")
fetch "rgs_example" "https://stake-engine.com/docs/rgs/example" || FAILED+=("rgs_example")

fetch "math" "https://stake-engine.com/docs/math" || FAILED+=("math")
fetch "math_setup" "https://stake-engine.com/docs/math/setup" || FAILED+=("math_setup")
fetch "math_quick_start" "https://stake-engine.com/docs/math/quick-start" || FAILED+=("math_quick_start")
fetch "math_optimization_algorithm" "https://stake-engine.com/docs/math/optimization-algorithm" || FAILED+=("math_optimization_algorithm")
fetch "math_game_format" "https://stake-engine.com/docs/math/high-level-structure/game-format" || FAILED+=("math_game_format")
fetch "math_outputs" "https://stake-engine.com/docs/math/source-files/outputs" || FAILED+=("math_outputs")

fetch "front_end" "https://stake-engine.com/docs/front-end" || FAILED+=("front_end")

echo ""
echo "========================================"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "DONE: All Stake Engine docs synced to $OUT"
else
  echo "PARTIAL: Some docs failed to sync:"
  printf '  - %s\n' "${FAILED[@]}"
  echo ""
  echo "Successfully synced docs are in: $OUT"
fi
echo "========================================"
