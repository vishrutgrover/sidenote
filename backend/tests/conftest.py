import os
import re
import tempfile

# point the app at a throwaway database before anything imports it
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, engine
from app.main import app


def pytest_collection_modifyitems(items):
    """Tag tests by folder so `pytest -m unit` works without decorators."""
    for item in items:
        for kind in ("unit", "integration"):
            if f"/tests/{kind}/" in str(item.fspath):
                item.add_marker(getattr(pytest.mark, kind))


@pytest.fixture
def db():
    """Empty in-memory database, one per test."""
    mem = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(mem)
    with sessionmaker(bind=mem)() as session:
        yield session


@pytest.fixture
def client():
    """Running API on a fresh, seeded database."""
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:  # entering the context runs startup: create tables + seed
        yield c


@pytest.fixture(autouse=True)
def no_llm_settings(monkeypatch):
    """Tests never see the developer's real API keys or provider choices."""
    for name in list(os.environ):
        if re.search(r"_API_KEY$|_BASE_URL$|_MODELS$|^LLM_", name):
            monkeypatch.delenv(name)
