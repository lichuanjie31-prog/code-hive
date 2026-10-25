from fastapi import APIRouter, Query

from app.core.permissions import Db, MemberUser
from app.models import Subscription
from app.modules.competitions.schemas import RelationListView
from app.modules.favorites.service import my_competitions, set_relation

router = APIRouter()


@router.put("/api/me/subscriptions/{competition_id}", status_code=204)
def subscribe(competition_id: str, db: Db, user: MemberUser) -> None:
    set_relation(db, user.id, competition_id, Subscription, True)


@router.delete("/api/me/subscriptions/{competition_id}", status_code=204)
def unsubscribe(competition_id: str, db: Db, user: MemberUser) -> None:
    set_relation(db, user.id, competition_id, Subscription, False)


@router.get("/api/me/subscriptions", response_model=RelationListView)
def subscriptions(db: Db, user: MemberUser, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)) -> RelationListView:
    return my_competitions(db, user.id, "subscriptions", offset, limit)
