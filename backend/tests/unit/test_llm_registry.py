import pytest

from app.services.llm import registry
from app.services.llm.registry import ProviderUnavailable


def names(enabled_only=True):
    return [n for n, p in registry.all_providers().items() if p.enabled or not enabled_only]


def test_with_no_keys_only_the_builtin_provider_is_available():
    assert names() == ["mock"]
    provider, model = registry.resolve()
    assert (provider.name, model) == ("mock", "heuristic")


def test_a_key_enables_its_provider_and_makes_it_the_default(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    assert names() == ["anthropic", "mock"]
    provider, model = registry.resolve()
    assert provider.name == "anthropic" and model == "claude-sonnet-5-5"


def test_every_key_based_provider_turns_on_with_its_own_variable(monkeypatch):
    for var in ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OLLAMA_BASE_URL"]:
        monkeypatch.setenv(var, "x")
    assert names() == ["anthropic", "openai", "gemini", "groq", "openrouter", "ollama", "mock"]


def test_blank_key_counts_as_not_configured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    assert names() == ["mock"]


def test_default_provider_and_model_from_settings(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_MODEL", "my-model")
    provider, model = registry.resolve()
    assert (provider.name, model) == ("groq", "my-model")


def test_default_model_setting_applies_only_to_the_default_provider(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_MODEL", "groq-only-model")
    provider, model = registry.resolve("openai")
    assert (provider.name, model) == ("openai", "gpt-4o-mini")


def test_explicit_choice_beats_settings(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "from-env")
    provider, model = registry.resolve("openai", "from-request")
    assert model == "from-request"


@pytest.mark.parametrize("name", ["nonsense", "anthropic", "ollama"])
def test_unknown_or_unconfigured_providers_are_refused(name):
    with pytest.raises(ProviderUnavailable):
        registry.resolve(name)


def test_empty_name_means_use_the_default():
    assert registry.resolve("")[0].name == "mock"


def test_a_misconfigured_default_is_skipped_not_fatal(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")  # no GEMINI_API_KEY
    assert registry.resolve()[0].name == "mock"
    monkeypatch.setenv("GROQ_API_KEY", "k")
    assert registry.resolve()[0].name == "groq"  # next configured provider wins
    monkeypatch.setenv("LLM_PROVIDER", "no-such-provider")
    assert registry.resolve()[0].name == "groq"
    with pytest.raises(ProviderUnavailable):
        registry.resolve("gemini")  # but asking for it by name is still an error


def test_model_list_can_be_replaced_from_settings(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.setenv("GROQ_MODELS", " a-model , b-model ,,")
    assert registry.all_providers()["groq"].models == ["a-model", "b-model"]


def test_base_url_setting_points_openai_at_another_server(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:1234/v1/")
    assert registry.all_providers()["openai"].base_url == "http://localhost:1234/v1"
