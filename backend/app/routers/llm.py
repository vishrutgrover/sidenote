from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AiRun
from ..schemas import AiRunOut, LlmModelsOut
from ..services.llm import registry

router = APIRouter(prefix="/api", tags=["ai"])


@router.get("/llm/models", response_model=LlmModelsOut)
def list_models():
    """Providers that are configured, with their models. API keys are never sent to the browser."""
    default, model = registry.resolve()
    return LlmModelsOut(
        default_provider=default.name, default_model=model,
        providers=[{"name": p.name, "label": p.label, "models": p.models} for p in registry.all_providers().values() if p.enabled],
    )


@router.get("/ai-runs", response_model=list[AiRunOut])
def list_runs(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    """The latest AI calls: which provider and model, how long it took, and whether it fell back."""
    return db.scalars(select(AiRun).order_by(AiRun.id.desc()).limit(limit)).all()
