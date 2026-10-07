POSITIVE = ("great", "love", "good", "nice", "perfect", "happy", "like that")
NEGATIVE = ("problem", "stuck", "worried", "risk", "slow", "bug", "blocker", "messy", "hurts")


def guess_sentiment(text: str) -> str:
    """Keyword guess. Real sentiment would come from the LLM; this keeps the mock path working."""
    low = text.lower()
    if any(w in low for w in NEGATIVE):
        return "negative"
    if any(w in low for w in POSITIVE):
        return "positive"
    return "neutral"
