from . import base


class OpenAICompatible(base.LLMProvider):
    """OpenAI, and anything that speaks the same API: Groq, OpenRouter, Together, a local Ollama..."""

    def __init__(self, name: str, label: str, base_url: str, api_key: str | None, models: list[str], enabled: bool):
        super().__init__(models, enabled)
        self.name, self.label, self.base_url, self.api_key = name, label, base_url.rstrip("/"), api_key

    def complete(self, system, prompt, model):
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        data = base.post_json(
            f"{self.base_url}/chat/completions", headers,
            {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
        )
        return data["choices"][0]["message"]["content"]
