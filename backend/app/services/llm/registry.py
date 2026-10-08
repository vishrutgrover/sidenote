"""Which providers exist, which are configured, and which one a request should use.

Settings come from environment variables, read on every call so changes apply without a restart:
  LLM_PROVIDER / LLM_MODEL            defaults (optional)
  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY
  OPENAI_BASE_URL, OLLAMA_BASE_URL    point at another OpenAI-compatible server
  <PROVIDER>_MODELS                   comma separated list, replaces the built-in model list
"""
import logging
import os

from .anthropic import Anthropic
from .base import LLMProvider
from .gemini import Gemini
from .mock import Mock
from .openai import OpenAICompatible


log = logging.getLogger(__name__)


class ProviderUnavailable(ValueError):
    pass


def models(env_name: str, default: list[str]) -> list[str]:
    return [m.strip() for m in os.getenv(env_name, "").split(",") if m.strip()] or default


def all_providers() -> dict[str, LLMProvider]:
    e = os.getenv
    providers = [
        Anthropic(e("ANTHROPIC_API_KEY"), models("ANTHROPIC_MODELS",
                  ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5-20251001"])),
        OpenAICompatible("openai", "OpenAI", e("OPENAI_BASE_URL", "https://api.openai.com/v1"), e("OPENAI_API_KEY"),
                         models("OPENAI_MODELS", ["gpt-4o-mini", "gpt-4o"]), bool(e("OPENAI_API_KEY"))),
        Gemini(e("GEMINI_API_KEY"), models("GEMINI_MODELS", ["gemini-2.0-flash"])),
        OpenAICompatible("groq", "Groq", "https://api.groq.com/openai/v1", e("GROQ_API_KEY"),
                         models("GROQ_MODELS", ["llama-3.3-70b-versatile"]), bool(e("GROQ_API_KEY"))),
        OpenAICompatible("deepseek", "DeepSeek", "https://api.deepseek.com/v1", e("DEEPSEEK_API_KEY"),
                         models("DEEPSEEK_MODELS", ["deepseek-v4-flash", "deepseek-v4-pro"]), bool(e("DEEPSEEK_API_KEY"))),
        OpenAICompatible("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", e("OPENROUTER_API_KEY"),
                         models("OPENROUTER_MODELS", ["openai/gpt-4o-mini"]), bool(e("OPENROUTER_API_KEY"))),
        OpenAICompatible("ollama", "Ollama (local)", e("OLLAMA_BASE_URL", "http://localhost:11434/v1"), None,
                         models("OLLAMA_MODELS", ["llama3.2"]), bool(e("OLLAMA_BASE_URL"))),
        Mock(),
    ]
    return {p.name: p for p in providers}


def default_name() -> str:
    """LLM_PROVIDER if it is configured, else the first configured real provider, else the built-in one.
    A typo in the setting must not take the app down, so an unusable default is skipped with a warning."""
    providers = all_providers()
    wanted = os.getenv("LLM_PROVIDER")
    if wanted and providers.get(wanted) and providers[wanted].enabled:
        return wanted
    if wanted:
        log.warning("LLM_PROVIDER=%s is unknown or has no API key; using the next available provider", wanted)
    return next((n for n, p in providers.items() if p.enabled and n != "mock"), "mock")


def resolve(name: str | None = None, model: str | None = None) -> tuple[LLMProvider, str]:
    """Pick the provider and model for a request. Raises ProviderUnavailable for unknown or unconfigured ones."""
    providers = all_providers()
    chosen = name or default_name()
    provider = providers.get(chosen)
    if not provider or not provider.enabled:
        raise ProviderUnavailable(f"Provider '{chosen}' is not available")
    if not model and not name and chosen == os.getenv("LLM_PROVIDER"):
        model = os.getenv("LLM_MODEL")
    return provider, model or provider.models[0]
