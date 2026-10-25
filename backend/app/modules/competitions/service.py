from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Competition, Milestone, MilestoneSource, MilestoneTrack, Source, Track
from app.modules.competitions.schemas import CompetitionListView, CompetitionView


def public_competition(db: Session, competition_id: str) -> Competition:
    item = db.get(Competition, competition_id)
    if item is None or item.publication_status == "draft":
        raise HTTPException(404, "比赛不存在")
    return item


def competition_view(db: Session, item: Competition) -> CompetitionView:
    tracks = list(db.scalars(select(Track).where(Track.competition_id == item.id).order_by(Track.id)))
    milestones = list(db.scalars(select(Milestone).where(Milestone.competition_id == item.id)))
    sources = list(db.scalars(select(Source).where(Source.competition_id == item.id)))
    source_keys = {source.id: source.source_key for source in sources}
    timeline = []
    for milestone in sorted(milestones, key=lambda m: m.details.get("position", 0)):
        data = {k: v for k, v in milestone.details.items() if k != "position"}
        data.update(id=milestone.id,
                    trackIds=list(db.scalars(select(MilestoneTrack.track_id).where(MilestoneTrack.milestone_id == milestone.id))),
                    sourceIds=[source_keys[key] for key in db.scalars(select(MilestoneSource.source_id).where(MilestoneSource.milestone_id == milestone.id))])
        timeline.append(data)
    payload = {**item.details, "id": item.id, "slug": item.slug, "name": item.name, "edition": item.edition,
               "year": item.year, "summary": item.summary, "eligibility": item.eligibility,
               "publicationStatus": item.publication_status,
               "tracks": [{**track.details, "id": track.id, "name": track.name, "requirements": track.requirements} for track in tracks],
               "timeline": timeline,
               "sources": {source.source_key: {"id": source.source_key, "title": source.title, "url": source.url,
                           "kind": source.kind, "checkedAt": str(source.checked_at),
                           "publishedAt": str(source.published_at) if source.published_at else None} for source in sources}}
    return CompetitionView.model_validate(payload)


def list_competitions(db: Session, query: str, direction: str, status: str, offset: int, limit: int) -> CompetitionListView:
    candidates = db.scalars(select(Competition).where(Competition.publication_status.in_(["published", "archived"])).order_by(Competition.id))
    term = query.strip().casefold()
    items = [item for item in candidates if
             (not direction or direction in item.details.get("directions", [])) and
             (not status or status == item.details.get("status")) and
             (not term or term in " ".join([item.name, item.summary, item.details.get("shortName", ""), *item.details.get("directions", [])]).casefold())]
    return CompetitionListView(items=[competition_view(db, item) for item in items[offset:offset + limit]], total=len(items))


def get_by_slug(db: Session, slug: str) -> CompetitionView:
    item = db.scalar(select(Competition).where(Competition.slug == slug, Competition.publication_status.in_(["published", "archived"])))
    if item is None:
        raise HTTPException(404, "比赛不存在")
    return competition_view(db, item)
