import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.main import cors_settings


def test_defaults_to_the_local_frontend(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert cors_settings() == {"allow_origins": ["http://localhost:3000"], "allow_origin_regex": None}


def test_several_origins_are_split_and_tidied(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", " https://a.example , https://b.example,, ")
    assert cors_settings()["allow_origins"] == ["https://a.example", "https://b.example"]


def test_blank_regex_means_none(monkeypatch):
    monkeypatch.setenv("CORS_ORIGIN_REGEX", "")
    assert cors_settings()["allow_origin_regex"] is None


@pytest.mark.parametrize("origin,allowed", [
    ("https://sidenote.vercel.app", True),
    ("https://sidenote-git-feature-x-me.vercel.app", True),
    ("https://evil.example", False),
    ("https://vercel.app.evil.example", False),
    ("http://sidenote.vercel.app", False),  # plain http is not allowed by the pattern
])
def test_the_settings_really_allow_and_refuse_the_right_sites(monkeypatch, origin, allowed):
    monkeypatch.setenv("CORS_ORIGINS", "https://exact.example")
    monkeypatch.setenv("CORS_ORIGIN_REGEX", r"https://[a-z0-9-]+\.vercel\.app")
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_methods=["*"], allow_headers=["*"], **cors_settings())

    @app.get("/x")
    def x():
        return {}

    r = TestClient(app).get("/x", headers={"Origin": origin})
    assert (r.headers.get("access-control-allow-origin") == origin) is allowed


def test_the_exact_origin_is_allowed_alongside_the_pattern(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://exact.example")
    monkeypatch.setenv("CORS_ORIGIN_REGEX", r"https://[a-z0-9-]+\.vercel\.app")
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_methods=["*"], allow_headers=["*"], **cors_settings())
    r = TestClient(app).options("/x", headers={"Origin": "https://exact.example", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "https://exact.example"
