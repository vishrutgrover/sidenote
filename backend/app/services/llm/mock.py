from . import base


class Mock(base.LLMProvider):
    """Always available, needs no key. The summary and answer logic for it lives in services/ai_mock.py."""
    name, label = "mock", "Built-in (no API key)"

    def __init__(self):
        super().__init__(["heuristic"], True)

    def complete(self, system, prompt, model):
        raise base.LLMError("the built-in provider does not generate text")
