from . import base


class Anthropic(base.LLMProvider):
    name, label = "anthropic", "Anthropic"

    def __init__(self, api_key: str | None, models: list[str]):
        super().__init__(models, bool(api_key))
        self.api_key = api_key

    def complete(self, system, prompt, model):
        data = base.post_json(
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
            {"model": model, "max_tokens": 2000, "system": system, "messages": [{"role": "user", "content": prompt}]},
        )
        return "".join(block.get("text", "") for block in data["content"])
