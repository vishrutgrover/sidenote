from fastapi import APIRouter, Depends

from ..deps import current_user
from ..models import User

router = APIRouter(prefix="/api", tags=["me"])


@router.get("/me")
def me(user: User = Depends(current_user)):
    """The logged-in user (there is no login, so always the first user)."""
    return {"id": user.id, "name": user.name, "email": user.email, "person_id": user.person_id}
