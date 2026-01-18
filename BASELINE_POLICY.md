# Baseline Update Policy

This document defines the rules and process for updating canonical baseline files in `out/`.

---

## Canonical Baseline Files

These files are **committed to git** and require explicit approval to update:

| File | Purpose |
|------|---------|
| `out/audit_base_gate.csv` | Base mode canonical snapshot |
| `out/audit_buy_gate.csv` | Buy mode canonical snapshot |
| `out/audit_hype_gate.csv` | Hype mode canonical snapshot |
| `out/tail_baseline_buy_gate.csv` | Tail progression baseline |

---

## When Baseline Updates Are Allowed

Baselines may **only** be updated when one of these conditions is met:

1. **config_hash changed** — game math was intentionally modified
   - Changes in `backend/app/config.py`
   - Changes in `backend/app/logic/engine.py`
   - Changes in `CONFIG.md` or `GAME_RULES.md`

2. **Canonical parameters changed** — seed, rounds, or mode definitions updated
   - Documented in `out/README.md`

3. **Intentional rebaseline** — after audit review confirms new values are acceptable
   - Must have explicit justification

---

## PR Requirements for Baseline Changes

Any PR that modifies `out/*_gate.csv` or `out/tail_baseline_*.csv` **MUST** include:

### 1. Justification
- [ ] Clear explanation of **why** baselines are changing
- [ ] Link to related issue/ticket if applicable

### 2. Accompanying Code Changes
At least one of these files must also be modified in the same PR:
- `backend/app/config.py`
- `backend/app/logic/engine.py`
- `CONFIG.md`
- `GAME_RULES.md`
- `RNG_POLICY.md`

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

# What it checks:
# 1. If baseline files changed in git
# 2. If so, verifies that engine/config/laws also changed
# 3. Fails if baseline changed without accompanying code changes
```

### Exit Codes
- `0` — No baseline changes, or baseline changes with valid accompanying changes
- `1` — Baseline changed without required accompanying changes (BLOCKED)

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

---

## Related Documentation

- `out/README.md` — Canonical snapshot parameters and usage
- `CONFIG.md` — Game configuration and math parameters
- `GAME_RULES.md` — Game mechanics and cap definitions
