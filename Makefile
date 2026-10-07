.PHONY: test test-unit test-integration run

PY = backend/.venv/bin

test:
	cd backend && ../$(PY)/python -m pytest -q

test-unit:
	cd backend && ../$(PY)/python -m pytest tests/unit -q

test-integration:
	cd backend && ../$(PY)/python -m pytest tests/integration -q

run:
	cd backend && ../$(PY)/uvicorn app.main:app --reload
