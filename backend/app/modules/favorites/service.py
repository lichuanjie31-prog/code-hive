from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import Competition, Favorite, Subscription
from app.modules.competitions.schemas import RelationListView, RelationView
from app.modules.competitions.service import competition_view, public_competition


def set_relation(db: Session, user_id: int, competition_id: str, model: type[Favorite] | type[Subscription], enabled: bool) -> None:
    public_competition(db, competition_id)
    if enabled:
        insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
        db.execute(insert(model).values(user_id=user_id, competition_id=competition_id)
                   .on_conflict_do_nothing(index_elements=[model.user_id, model.competition_id]))
    else:
        db.execute(delete(model).where(model.user_id == user_id, model.competition_id == competition_id))
    db.commit()


def my_competitions(db: Session, user_id: int, kind: Literal["all", "favorites", "subscriptions"], offset: int, limit: int) -> RelationListView:
    favorites = set(db.scalars(select(Favorite.competition_id).where(Favorite.user_id == user_id)))
    subscriptions = set(db.scalars(select(Subscription.competition_id).where(Subscription.user_id == user_id)))
    ids = favorites if kind == "favorites" else subscriptions if kind == "subscriptions" else favorites | subscriptions
    items = list(db.scalars(select(Competition).where(Competition.id.in_(ids), Competition.publication_status != "draft").order_by(Competition.id)))
    return RelationListView(items=[RelationView(competition=competition_view(db, item), favorite=item.id in favorites, subscribed=item.id in subscriptions) for item in items[offset:offset + limit]], total=len(items))
