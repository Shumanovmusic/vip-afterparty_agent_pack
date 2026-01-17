# Pipeline Gates (VIP Afterparty)

Every iteration MUST pass these gates before "done".

---

## Gate 1: Documentation Sync

**Command:**
```bash
bash scripts/sync_stake_docs.sh
```

**Pass criteria:**
- Script exits 0
- `stake_docs/library/api/` contains non-empty `.md` files
- At minimum: `approval_guidelines.md`, `rgs.md`, `rgs_wallet.md`

**Verify:**
```bash
ls -la stake_docs/library/api/*.md | wc -l
# Expected: >= 16 files
```

---

## Gate 2: Backend Tests

**Command:**
```bash
make test
```

**Or directly:**
```bash
cd backend && python -m pytest -q
```

**Pass criteria:**
- All tests pass (exit 0)
- No skipped contract/idempotency/locking tests (once implemented)

**Current placeholder tests (to be unskipped):**
- `test_contract_placeholder.py`
- `test_idempotency_placeholder.py`
- `test_locking_placeholder.py`

---

## Gate 3: Docker Services

**Command:**
```bash
make up
docker compose ps
curl -s http://localhost:8000/health
make down
```

**Pass criteria:**
- Both `redis` and `backend` containers healthy
- `/health` returns `{"ok": true}`

---

## Gate 4: Math Optimizer (if applicable)

**Prerequisites check:**
```bash
python3 --version  # >= 3.12
cargo --version    # Rust installed (required for optimization)
```

**Command (TODO — when audit_sim.py exists):**
```bash
python backend/scripts/audit_sim.py --seed AUDIT_2025 --rounds 100000
```

**Pass criteria:**
- No payout exceeds `MAX_WIN_TOTAL_X = 25000`
- RTP within expected tolerance
- Frequencies match expected ranges
- Seed and config_hash logged

**Status:** TODO — `audit_sim.py` not yet implemented

---

## Gate 5: Frontend Build (when implemented)

**Command:**
```bash
cd frontend && npm install && npm run typecheck && npm run build
```

**Pass criteria:**
- TypeScript compilation succeeds
- Build outputs to `dist/`
- No console errors in build

**Status:** TODO — frontend not yet scaffolded

---

## Gate 6: Approval Lint (when implemented)

**Command (TODO):**
```bash
python scripts/approval_lint.py
```

**Pass criteria:**
- Rules/Paytable accessible from UI
- RTP displayed
- Max win displayed
- Bet selector works
- Balance displayed
- Sound toggle present
- Spacebar mapped to spin
- No external asset loading (XSS)
- Social mode phrases correct when `social=true`

**Status:** TODO — `approval_lint.py` not yet implemented

---

## Quick Gate Summary

| Gate | Command | Status |
|------|---------|--------|
| Docs Sync | `bash scripts/sync_stake_docs.sh` | ✅ Ready |
| Backend Tests | `make test` | ✅ Ready |
| Docker Services | `make up && curl /health && make down` | ✅ Ready |
| Math Audit | `python backend/scripts/audit_sim.py` | 🚧 TODO |
| Frontend Build | `npm run build` | 🚧 TODO |
| Approval Lint | `python scripts/approval_lint.py` | 🚧 TODO |

---

## CI Integration (Recommended)

```yaml
# .github/workflows/gates.yml (example)
name: Pipeline Gates
on: [push, pull_request]
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync Stake Docs
        run: bash scripts/sync_stake_docs.sh
      - name: Backend Tests
        run: |
          cd backend
          pip install -e ".[dev]"
          pytest -q
      - name: Docker Smoke Test
        run: |
          docker compose up -d
          sleep 5
          curl -f http://localhost:8000/health
          docker compose down
```

---

## Iteration Workflow

1. **Before coding:** Read `LAWS_INDEX.md` and all referenced files
2. **After changes:** Run gates 1-3 locally
3. **Before "done":** All gates green, no skipped tests
4. **If gate fails:** Fix issue or create `ISSUE.md` and stop
