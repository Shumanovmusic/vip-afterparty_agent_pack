.PHONY: up down test dev install clean install-hooks

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
