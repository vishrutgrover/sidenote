import httpx


class LLMError(Exception):
    """A provider call failed. The message is safe to show: it never contains the API key."""


def post_json(url: str, headers: dict, body: dict, timeout: float = 60.0) -> dict:
    """The only place that touches the network. Tests replace this one function."""
    try:
        r = httpx.post(url, headers=headers, json=body, timeout=timeout)
    except httpx.HTTPError as e:
        raise LLMError(f"request failed ({type(e).__name__})") from None
    if r.status_code != 200:
        raise LLMError(f"HTTP {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except ValueError:
        raise LLMError("response was not JSON") from None


class LLMProvider:
    """One AI service. To add a provider: subclass this, implement complete(), add it to registry.py."""
    name = ""
    label = ""

    def __init__(self, models: list[str], enabled: bool):
        self.models = models
        self.enabled = enabled  # true when its API key (or host) is configured

    def complete(self, system: str, prompt: str, model: str) -> str:
        raise NotImplementedError
