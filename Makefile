.PHONY: up down test dev install clean install-hooks gate

up:
	docker compose up -d

down:
	docker compose down

test:
	cd backend && .venv/bin/python -m pytest -q

dev:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

install:
	cd backend && pip install -e ".[dev]"

clean:
	docker compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

install-hooks:
	@echo "Installing pre-commit hooks..."
	@cp scripts/pre-commit-no-5000x.sh .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Pre-commit hook installed: blocks 5000x cap reintroduction"

gate:
	@echo "=== GATE PACK v2 ==="
	@echo "Step 1: Running make test..."
	$(MAKE) test
	@echo ""
	@echo "Step 2: Running audit_sim --mode base..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode base --rounds 100000 --seed AUDIT_2025 --out ../out/audit_base.csv --verbose
	@echo ""
	@echo "Step 3: Running audit_sim --mode buy..."
	cd backend && .venv/bin/python -m scripts.audit_sim --mode buy --rounds 50000 --seed AUDIT_2025 --out ../out/audit_buy.csv --verbose
	@echo ""
	@echo "Step 4: Running seed_hunt (1000x+ tail)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 1000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds.json --verbose
	@echo ""
	@echo "Step 5: Running tail gate and VIP snapshot tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_tail_gate.py tests/test_rng_vip_snapshots.py
	@echo ""
	@echo "Step 6: GATE 4 - Cap Reachability (10000x+ tail)..."
	cd backend && .venv/bin/python -m scripts.seed_hunt --mode buy --min_win_x 10000 --target high --max_seeds 200000 --seed_prefix HUNT --out ../out/tail_seeds_10k.json --verbose
	@echo ""
	@echo "Step 7: Running cap reachability gate tests..."
	cd backend && .venv/bin/python -m pytest -q tests/test_cap_reachability_gate.py
	@echo ""
	@echo "=== GATE PACK v2 COMPLETE ==="
