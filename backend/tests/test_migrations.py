import json
from pathlib import Path

from alembic import command
from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateIndex, CreateTable
import pytest

from app.models import Base, Competition, JoinApplication, Milestone, Track, User


def test_snapshot_ids_dates_and_upgrade_preserves_records(environment):
    _, factory, config = environment
    snapshot = json.loads((Path(__file__).parents[1] / "seed/competitions-v1.json").read_text(encoding="utf-8"))
    with factory() as db:
        assert set(db.scalars(select(Competition.id))) == {item["id"] for item in snapshot["competitions"]}
        assert set(db.scalars(select(Track.id))) == {track["id"] for item in snapshot["competitions"] for track in item["tracks"]}
        assert set(db.scalars(select(Milestone.id))) == {event["id"] for item in snapshot["competitions"] for event in item["timeline"]}
        assert db.get(Milestone, "evt-soft-campus").date is None
        assert db.get(Milestone, "evt-soft-final").date is None
        assert db.get(Milestone, "evt-design-software-final").exact_time is None
        assert str(db.get(Milestone, "evt-service-registration").exact_time) == "16:00:00"
        assert db.get(Milestone, "evt-service-registration").evidence_text is None
    command.upgrade(config, "head")
    command.check(config)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Competition)) == 3
        assert db.scalar(select(func.count()).select_from(User)) == 1


def test_pending_unique_and_foreign_keys(environment):
    _, factory, _ = environment
    with factory() as db:
        user_id = db.scalar(select(User.id))
        db.add(JoinApplication(user_id=user_id, school="学校", reason="申请", discovery="社区"))
        db.commit()
        db.add(JoinApplication(user_id=user_id, school="学校", reason="重复", discovery="社区"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        db.add(JoinApplication(user_id=999999, school="学校", reason="无效", discovery="社区"))
        with pytest.raises(IntegrityError):
            db.commit()


def test_postgresql_schema_compiles():
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        assert "CREATE TABLE" in str(CreateTable(table).compile(dialect=dialect))
        for index in table.indexes:
            sql = str(CreateIndex(index).compile(dialect=dialect))
            if index.name == "uq_pending_application":
                assert "WHERE status = 'pending'" in sql and "UNIQUE" in sql
