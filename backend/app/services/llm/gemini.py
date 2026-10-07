from . import base


class Gemini(base.LLMProvider):
    name, label = "gemini", "Google Gemini"

    def __init__(self, api_key: str | None, models: list[str]):
        super().__init__(models, bool(api_key))
        self.api_key = api_key

    def complete(self, system, prompt, model):
        data = base.post_json(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            {"x-goog-api-key": self.api_key},  # header, not ?key=, so it never lands in URLs or logs
            {"system_instruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}]},
        )
        return "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"])
