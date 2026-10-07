import httpx
import pytest

from app.services.llm import base
from app.services.llm.anthropic import Anthropic
from app.services.llm.base import LLMError
from app.services.llm.gemini import Gemini
from app.services.llm.mock import Mock
from app.services.llm.openai import OpenAICompatible


@pytest.fixture
def sent(monkeypatch):
    """Capture what a provider would send, and answer with whatever the test sets in sent.reply."""
    class Sent:
        reply = {}
        calls = []
    s = Sent()
    s.calls = []

    def fake(url, headers, body, timeout=60.0):
        s.calls.append((url, headers, body))
        return s.reply
    monkeypatch.setattr(base, "post_json", fake)
    return s


def test_anthropic_request_and_reply(sent):
    sent.reply = {"content": [{"type": "text", "text": "Hello "}, {"type": "text", "text": "world"}]}
    out = Anthropic("sk-test", []).complete("be brief", "hi", "claude-x")
    url, headers, body = sent.calls[0]
    assert out == "Hello world"
    assert url == "https://api.anthropic.com/v1/messages"
    assert headers["x-api-key"] == "sk-test" and headers["anthropic-version"]
    assert body["model"] == "claude-x" and body["system"] == "be brief" and body["messages"] == [{"role": "user", "content": "hi"}]


def test_openai_compatible_request_and_reply(sent):
    sent.reply = {"choices": [{"message": {"content": "ok"}}]}
    p = OpenAICompatible("groq", "Groq", "https://api.groq.com/openai/v1/", "gk", ["m"], True)
    assert p.complete("sys", "usr", "llama") == "ok"
    url, headers, body = sent.calls[0]
    assert url == "https://api.groq.com/openai/v1/chat/completions"
    assert headers == {"Authorization": "Bearer gk"}
    assert body["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]


def test_local_server_without_a_key_sends_no_auth_header(sent):
    sent.reply = {"choices": [{"message": {"content": "ok"}}]}
    OpenAICompatible("ollama", "Ollama", "http://localhost:11434/v1", None, ["m"], True).complete("s", "u", "llama3.2")
    assert sent.calls[0][1] == {}


def test_gemini_puts_the_key_in_a_header_not_the_url(sent):
    sent.reply = {"candidates": [{"content": {"parts": [{"text": "a"}, {"text": "b"}]}}]}
    assert Gemini("gk", []).complete("sys", "usr", "gemini-2.0-flash") == "ab"
    url, headers, body = sent.calls[0]
    assert url.endswith("/models/gemini-2.0-flash:generateContent") and "gk" not in url
    assert headers == {"x-goog-api-key": "gk"}
    assert body["system_instruction"]["parts"][0]["text"] == "sys"


def test_unexpected_reply_shapes_raise_instead_of_returning_garbage(sent):
    sent.reply = {"unexpected": True}
    for provider in (Anthropic("k", []), Gemini("k", []), OpenAICompatible("o", "O", "http://x", "k", [], True)):
        with pytest.raises((KeyError, IndexError, TypeError)):
            provider.complete("s", "u", "m")


def test_the_builtin_provider_cannot_generate_text():
    with pytest.raises(LLMError):
        Mock().complete("s", "u", "m")


# ---- the one function that does real HTTP ---------------------------------------

def test_http_errors_become_llm_errors_with_a_short_body(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(401, text="x" * 900))
    with pytest.raises(LLMError) as e:
        base.post_json("http://x", {"x-api-key": "SECRET"}, {})
    assert "401" in str(e.value) and len(str(e.value)) < 300 and "SECRET" not in str(e.value)


def test_network_failures_become_llm_errors(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("refused for http://x?key=SECRET")
    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(LLMError) as e:
        base.post_json("http://x", {}, {})
    assert "ConnectError" in str(e.value) and "SECRET" not in str(e.value)


def test_non_json_success_is_an_llm_error(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(200, text="<html>"))
    with pytest.raises(LLMError):
        base.post_json("http://x", {}, {})
