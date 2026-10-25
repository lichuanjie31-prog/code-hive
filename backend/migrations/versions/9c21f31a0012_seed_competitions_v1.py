"""Import the immutable first-edition snapshot, preserving every stable ID."""
import json
import re
from datetime import date, time
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "9c21f31a0012"
down_revision = "6ab5ef7cfbd1"
branch_labels = None
depends_on = None


def table(table_name: str, **columns: sa.types.TypeEngine) -> sa.TableClause:
    return sa.table(table_name, *(sa.column(key, value) for key, value in columns.items()))


def upgrade() -> None:
    snapshot = json.loads((Path(__file__).parents[2] / "seed" / "competitions-v1.json").read_text(encoding="utf-8"))
    competitions = table("competitions", id=sa.String(), slug=sa.String(), name=sa.String(), edition=sa.String(), year=sa.Integer(), summary=sa.Text(), eligibility=sa.Text(), publication_status=sa.String(), details=sa.JSON())
    tracks = table("tracks", id=sa.String(), competition_id=sa.String(), name=sa.String(), requirements=sa.Text(), analysis=sa.Text(), details=sa.JSON())
    sources = table("sources", id=sa.String(), competition_id=sa.String(), source_key=sa.String(), title=sa.Text(), url=sa.Text(), kind=sa.String(), checked_at=sa.Date(), published_at=sa.Date())
    milestones = table("milestones", id=sa.String(), competition_id=sa.String(), track_id=sa.String(), source_id=sa.String(), kind=sa.String(), date=sa.Date(), end_date=sa.Date(), exact_time=sa.Time(), end_time=sa.Time(), timezone=sa.String(), evidence_text=sa.Text(), details=sa.JSON())
    milestone_tracks = table("milestone_tracks", milestone_id=sa.String(), track_id=sa.String())
    milestone_sources = table("milestone_sources", milestone_id=sa.String(), source_id=sa.String())
    for item in snapshot["competitions"]:
        excluded = {"id", "slug", "name", "edition", "year", "summary", "eligibility", "tracks", "timeline"}
        op.bulk_insert(competitions, [{**{key: item[key] for key in excluded - {"tracks", "timeline"}},
                                     "publication_status": "archived" if item["status"] == "本届已结束" else "published",
                                     "details": {key: value for key, value in item.items() if key not in excluded}}])
        for track in item["tracks"]:
            op.bulk_insert(tracks, [{"id": track["id"], "competition_id": item["id"], "name": track["name"], "requirements": track["requirements"], "analysis": None,
                                    "details": {key: value for key, value in track.items() if key not in {"id", "name", "requirements"}}}])
        for key in item["sourceIds"]:
            source = snapshot["competitionSources"][key]
            op.bulk_insert(sources, [{"id": f'{item["id"]}:{key}', "competition_id": item["id"], "source_key": key, "title": source["title"], "url": source["url"], "kind": source["kind"], "checked_at": date.fromisoformat(item["checkedAt"]), "published_at": date.fromisoformat(source["publishedAt"]) if source["publishedAt"] else None}])
        for position, event in enumerate(item["timeline"]):
            text = event["dateText"] or ""
            dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
            clocks = re.findall(r"\b(\d{2}:\d{2})\b", text)
            # Plan/uncertainty qualifiers remain in details; month-only nodes stay NULL.
            op.bulk_insert(milestones, [{"id": event["id"], "competition_id": item["id"],
                                        "track_id": event["trackIds"][0] if len(event["trackIds"]) == 1 else None,
                                        "source_id": f'{item["id"]}:{event["sourceIds"][0]}' if event["sourceIds"] else None,
                                        "kind": event["name"], "date": date.fromisoformat(dates[0]) if dates else None,
                                        "end_date": date.fromisoformat(dates[1]) if len(dates) > 1 else None,
                                        "exact_time": time.fromisoformat(clocks[0]) if clocks else None,
                                        "end_time": time.fromisoformat(clocks[1]) if len(clocks) > 1 else None,
                                        "timezone": "Asia/Shanghai" if clocks else None,
                                        "evidence_text": None,  # v1 does not contain verbatim source excerpts.
                                        "details": {**{key: value for key, value in event.items() if key not in {"id", "trackIds", "sourceIds"}}, "position": position}}])
            for track_id in event["trackIds"]:
                op.bulk_insert(milestone_tracks, [{"milestone_id": event["id"], "track_id": track_id}])
            for key in event["sourceIds"]:
                op.bulk_insert(milestone_sources, [{"milestone_id": event["id"], "source_id": f'{item["id"]}:{key}'}])


def downgrade() -> None:
    # No data-deleting reverse migration: competition IDs can have member relations.
    raise RuntimeError("比赛快照迁移不支持自动回退；请先备份并人工制定保留关联的数据迁移")
