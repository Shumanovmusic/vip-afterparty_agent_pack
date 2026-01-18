# Audit Output Directory

This directory contains simulation output files produced by `audit_sim.py`.

## Long-Run Audit (`make audit-long`)

The **long-run audit** is a stability check workflow for deep statistical analysis. It is **NOT** part of `make gate` or CI pipelines — run it manually when you need high-precision RTP measurements.

### Purpose

- Verify RTP convergence over large sample sizes
- Detect rare tail events (1000x+, 10000x+, capped wins)
- Validate wallet correctness over extended runs
- Ensure math stability before major releases

### Commands

```bash
# Run the full long-run audit (takes several minutes)
make audit-long
```

### Output Files

| File | Mode | Rounds | Description |
|------|------|--------|-------------|
| `audit_base_1m.csv` | base | 1,000,000 | Base game RTP with high precision (±1% tolerance at 1M rounds) |
| `audit_buy_200k.csv` | buy | 200,000 | Buy feature mode with extended tail observation |
| `audit_hype_200k.csv` | hype | 200,000 | Hype mode (ante bet) wager-based RTP |

### Key CSV Fields

| Field | Description |
|-------|-------------|
| `config_hash` | SHA256 hash of game config. Same hash = same math. Use for reproducibility verification. |
| `rtp` | Return to Player percentage: `total_won / total_wagered * 100` |
| `debit_multiplier` | Cost multiplier: 1.0 (base), 100.0 (buy), 1.25 (hype) |
| `avg_debit` | Average bet per round (wagered) |
| `avg_credit` | Average win per round (returned) |
| `rate_1000x_plus` | Percentage of rounds with >=1000x win (tail distribution) |
| `rate_10000x_plus` | Percentage of rounds with >=10000x win (dream wins) |
| `capped_rate` | Percentage of rounds hitting MAX_WIN_TOTAL_X cap (25000x) |
| `bonus_entry_rate` | Percentage of rounds triggering bonus/free spins |

### Interpreting Results

**RTP Targets (from CONFIG.md):**
- Base: ~98.0% (±1.0% at 1M rounds)
- Buy: ~98.0% (±2.5% at 100K rounds)
- Hype: ~78.4% wager-based (players trade EV for higher bonus entry rate)

**Tail Distribution:**
- `rate_1000x_plus > 0` indicates tail is reachable
- `rate_10000x_plus` may be 0 even in 200K rounds (very rare)
- `capped_rate > 0` indicates cap (25000x) was hit

**Wallet Correctness:**
- `avg_debit * rounds == total_wagered`
- `avg_credit * rounds == total_won`
- `rtp == avg_credit / avg_debit * 100`

### Reproducibility

All long-run audits use deterministic seeding:

```
Seed: AUDIT_LONG_2026
```

Two runs with the same `seed` and `config_hash` will produce **identical** results. If results differ, check that:
1. `config_hash` matches (game math unchanged)
2. No engine changes between runs
3. Same Python version and dependencies

### Example Usage

```bash
# Run audit
make audit-long

# View results
cat out/audit_base_1m.csv

# Compare RTP across modes
head -2 out/audit_base_1m.csv out/audit_buy_200k.csv out/audit_hype_200k.csv
```

### Notes

- Long-run audit is **not cached** — it always runs fresh simulations
- Expect runtime of 5-15 minutes depending on hardware
- Results are written to `out/` directory (gitignored)
- To share results, copy the CSV files or paste the data rows

---

## Diff Audit (`make diff-audit`)

The **diff audit** is a diagnostic tool for verifying simulation determinism. It runs the same simulation twice with identical parameters and compares results to ensure reproducibility.

### Purpose

- Verify simulation reproducibility (same seed → same results)
- Diagnose RTP differences between gate tests and audit-long
- Detect non-determinism in the game engine
- Validate config_hash consistency across runs

### Commands

```bash
# Run diff audit (default: 20000 rounds)
make diff-audit

# Run with custom parameters
cd backend && .venv/bin/python -m scripts.diff_audit --rounds 50000 --seed CUSTOM_SEED --verbose
```

### Output Files

Files are written to `out/diff/`:

| File | Description |
|------|-------------|
| `diff_base_gate.csv` | Base mode "gate-like" run |
| `diff_base_long.csv` | Base mode "long-like" run |
| `diff_buy_gate.csv` | Buy mode "gate-like" run |
| `diff_buy_long.csv` | Buy mode "long-like" run |
| `diff_hype_gate.csv` | Hype mode "gate-like" run |
| `diff_hype_long.csv` | Hype mode "long-like" run |

### Interpreting Results

**PASS**: Both runs produce identical results — simulation is deterministic.

**FAIL**: Results differ — indicates:
- Non-determinism in the game engine
- RNG seeding issue
- Config hash mismatch (different game math)

### Comparison Table

The script outputs a comparison table showing:

```
================================================================================
DIFF AUDIT COMPARISON TABLE
================================================================================
Mode     | Run          |        RTP |    Hit% |   Bonus% |    Max Win
--------------------------------------------------------------------------------
base     | gate-like    |    98.0000 |  28.74  |    0.27  |     213.06
base     | long-like    |    98.0000 |  28.74  |    0.27  |     213.06
--------------------------------------------------------------------------------
...
```

### Exit Codes

- `0`: All modes passed (deterministic)
- `1`: At least one mode failed or config_hash mismatch

### Default Parameters

```
Rounds: 20000
Seed: DIFF_AUDIT_2026
Output dir: out/diff/
```
