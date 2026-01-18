# Baseline Update Policy

This document defines the rules and process for updating canonical baseline files in `out/`.

---

## Canonical Baseline Files

These files are **committed to git** and require explicit approval to update:

| File | Mode | Seed | Rounds | Purpose |
|------|------|------|--------|---------|
| `out/audit_base_gate.csv` | base | AUDIT_2025 | 20000 | Base mode canonical snapshot |
| `out/audit_buy_gate.csv` | buy | AUDIT_2025 | 20000 | Buy mode canonical snapshot |
| `out/audit_hype_gate.csv` | hype | AUDIT_2025 | 20000 | Hype mode canonical snapshot |
| `out/tail_baseline_buy_gate.csv` | buy | AUDIT_2025 | 20000 | Tail progression baseline |

---

## Canonical Parameters

All baseline files **MUST** use these exact parameters:

| Parameter | Value | Validation |
|-----------|-------|------------|
| `seed` | `AUDIT_2025` | Exact string match |
| `rounds` | `20000` | Exact numeric match |
| `mode` | Must match filename | `audit_base_gate.csv` → `base`, etc. |
| `config_hash` | Non-empty | Must be present |

The `scripts/check-baseline-changed.sh` script validates these parameters automatically.

---

## Allowlist: Paths That Justify Baseline Changes

If a baseline file changes, **at least one** of these paths must also change in the same commit/PR:

### Engine/Math Code
```
backend/app/logic/**          # Any file in logic directory
backend/app/config.py         # Game configuration
```

### Audit/Simulation Scripts
```
backend/scripts/audit_sim.py
backend/scripts/diff_audit.py
backend/scripts/tail_progression.py
```

### Laws/Spec Documentation
```
CONFIG.md
GAME_RULES.md
TELEMETRY.md
LAWS_INDEX.md
CAP_REACHABILITY.md
RNG_POLICY.md
```

### Build System
```
Makefile                      # Canonical param definitions
```

**Changes to other files (e.g., README.md, tests, frontend) do NOT justify baseline updates.**

---

## When Baseline Updates Are Allowed

Baselines may **only** be updated when one of these conditions is met:

1. **config_hash changed** — game math was intentionally modified
   - Changes in `backend/app/config.py`
   - Changes in `backend/app/logic/**`
   - Changes in `CONFIG.md` or `GAME_RULES.md`

2. **Canonical parameters changed** — seed, rounds, or mode definitions updated
   - Documented in `out/README.md`
   - Changes in `Makefile`

3. **Audit script logic changed** — simulation output format changed
   - Changes in `backend/scripts/audit_sim.py`

---

## PR Requirements for Baseline Changes

Any PR that modifies `out/*_gate.csv` or `out/tail_baseline_*.csv` **MUST** include:

### 1. Justification
- [ ] Clear explanation of **why** baselines are changing
- [ ] Link to related issue/ticket if applicable

### 2. Accompanying Code Changes
At least one allowlisted path must also be modified (see Allowlist above).

### 3. Validation Evidence
- [ ] `make gate` output showing GATE PACK COMPLETE
- [ ] `make diff-audit-compare-base` PASSED
- [ ] `make diff-audit-compare-buy` PASSED
- [ ] `make diff-audit-compare-hype` PASSED

### 4. Before/After Comparison
Include diff of key metrics:
```
Field              | Before  | After   | Delta
-------------------|---------|---------|-------
rtp (base)         | 97.98   | 98.01   | +0.03
rtp (buy)          | 97.72   | 97.75   | +0.03
rtp (hype)         | 79.92   | 79.95   | +0.03
rate_1000x_plus    | 0.87    | 0.88    | +0.01
```

---

## Approval Process

### Self-Approval (Solo Dev)
1. Run `make check-baseline-changed` — must PASS
2. Verify all PR requirements above are met
3. Document decision in commit message

### Team Approval
1. PR author prepares all requirements above
2. **Math Owner** reviews:
   - Confirms math changes are intentional
   - Verifies RTP/tail metrics are within acceptable bounds
3. Approval required before merge

---

## Fail-Fast Check

The `scripts/check-baseline-changed.sh` script enforces this policy:

```bash
# Run locally before committing
make check-baseline-changed

# Check all uncommitted changes
make check-baseline-changed-all

# CI mode: compare against base branch
make check-baseline-changed-ci BASE_BRANCH=main
```

### What It Checks

1. **Baseline file detection** — Did any `out/*_gate.csv` file change?
2. **Canonical parameter validation** — Are mode/seed/rounds/config_hash correct?
3. **Allowlist enforcement** — Did at least one allowlisted path also change?

### Exit Codes
- `0` — No baseline changes, or baseline changes with valid justification
- `1` — Baseline changed without required justification (BLOCKED)

---

## Integration Points

### make gate (Step 0e)
```
Step 0e: Baseline Update Policy check (fail-fast)...
./scripts/check-baseline-changed.sh --all
```

### GitHub Actions CI
```yaml
- name: Baseline Update Policy check (fail-fast)
  run: ./scripts/check-baseline-changed.sh --branch "origin/${{ github.base_ref }}"
```

---

## Regenerating Baselines

When you have valid justification to regenerate:

```bash
# 1. Regenerate canonical snapshots
make audit-gate-snapshots

# 2. Regenerate tail baseline (if needed)
make tail-baseline

# 3. Verify new values
head -2 out/audit_*_gate.csv
cat out/tail_baseline_buy_gate.csv

# 4. Run full validation
make gate

# 5. Run diff-audit comparisons
make diff-audit-compare-base
make diff-audit-compare-buy
make diff-audit-compare-hype

# 6. Commit with detailed message
git add out/*_gate.csv
git commit -m "chore: rebaseline after <specific reason>

- config_hash: <old> -> <new>
- RTP change: <delta>
- Reason: <link or explanation>"
```

---

## Anti-Patterns (Do NOT Do)

1. **Silent regeneration** — Running `make audit-gate-snapshots` without code changes
2. **Variance-chasing** — Regenerating to get "better" numbers without math changes
3. **Skipping validation** — Committing baselines without running `make gate`
4. **Missing documentation** — Not explaining why baselines changed
5. **Wrong parameters** — Using non-canonical seed/rounds/mode

---

## Manual Test Matrix

Use this matrix to verify the baseline policy check works correctly:

| # | Scenario | Changed Files | Expected Result |
|---|----------|---------------|-----------------|
| 1 | No changes | (none) | PASS: "No changed files" |
| 2 | Non-baseline changes only | `README.md` | PASS: "No baseline files changed" |
| 3 | Baseline + allowlisted change | `out/audit_base_gate.csv` + `CONFIG.md` | PASS: "Allowlisted justifying changes" |
| 4 | Baseline + engine change | `out/audit_buy_gate.csv` + `backend/app/logic/engine.py` | PASS |
| 5 | Baseline + Makefile change | `out/audit_hype_gate.csv` + `Makefile` | PASS |
| 6 | **Baseline only (no justification)** | `out/audit_base_gate.csv` | **FAIL**: "WITHOUT allowlisted justifying changes" |
| 7 | Baseline + unrelated file | `out/audit_buy_gate.csv` + `tests/test_foo.py` | **FAIL** |
| 8 | Baseline with wrong mode | `out/audit_base_gate.csv` (mode=buy) | **FAIL**: "mode mismatch" |
| 9 | Baseline with wrong seed | `out/audit_base_gate.csv` (seed=WRONG) | **FAIL**: "seed mismatch" |
| 10 | Baseline with wrong rounds | `out/audit_base_gate.csv` (rounds=10000) | **FAIL**: "rounds mismatch" |
| 11 | Baseline with empty config_hash | `out/audit_base_gate.csv` (config_hash=) | **FAIL**: "config_hash is empty" |

### Running Manual Tests

```bash
# Test 1: No changes
./scripts/check-baseline-changed.sh
# Expected: PASS

# Test 6: Baseline only (simulate)
echo "# test" >> out/audit_base_gate.csv
git add out/audit_base_gate.csv
./scripts/check-baseline-changed.sh
# Expected: FAIL
git checkout out/audit_base_gate.csv

# Test 3: Baseline + allowlisted change (simulate)
echo "# test" >> out/audit_base_gate.csv
echo "# test" >> CONFIG.md
git add out/audit_base_gate.csv CONFIG.md
./scripts/check-baseline-changed.sh
# Expected: PASS
git checkout out/audit_base_gate.csv CONFIG.md
```

---

## Related Documentation

- `out/README.md` — Canonical snapshot parameters and usage
- `CONFIG.md` — Game configuration and math parameters
- `GAME_RULES.md` — Game mechanics and cap definitions
- `scripts/check-baseline-changed.sh` — Enforcement script source
