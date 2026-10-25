from typing import Literal

from fastapi import APIRouter, Query

from app.core.permissions import Db, MemberUser
from app.models import Favorite
from app.modules.competitions.schemas import RelationListView
from app.modules.favorites.service import my_competitions, set_relation

router = APIRouter()


@router.put("/api/me/favorites/{competition_id}", status_code=204)
def favorite(competition_id: str, db: Db, user: MemberUser) -> None:
    set_relation(db, user.id, competition_id, Favorite, True)


@router.delete("/api/me/favorites/{competition_id}", status_code=204)
def unfavorite(competition_id: str, db: Db, user: MemberUser) -> None:
    set_relation(db, user.id, competition_id, Favorite, False)


@router.get("/api/me/competitions", response_model=RelationListView)
def mine(db: Db, user: MemberUser, kind: Literal["all", "favorites", "subscriptions"] = "all", offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)) -> RelationListView:
    return my_competitions(db, user.id, kind, offset, limit)


@router.get("/api/me/favorites", response_model=RelationListView)
def favorites(db: Db, user: MemberUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)) -> RelationListView:
    return my_competitions(db, user.id, "favorites", offset, limit)
