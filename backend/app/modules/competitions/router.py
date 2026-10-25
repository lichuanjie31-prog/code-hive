from fastapi import APIRouter, Query

from app.core.permissions import Db
from app.modules.competitions.schemas import CompetitionListView, CompetitionView
from app.modules.competitions.service import get_by_slug, list_competitions

router = APIRouter(prefix="/api/competitions")


@router.get("", response_model=CompetitionListView)
def competitions(db: Db, query: str = Query("", max_length=200), direction: str = "", status: str = "", offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100)) -> CompetitionListView:
    return list_competitions(db, query, direction, status, offset, limit)


@router.get("/{slug}", response_model=CompetitionView)
def competition(slug: str, db: Db) -> CompetitionView:
    return get_by_slug(db, slug)
