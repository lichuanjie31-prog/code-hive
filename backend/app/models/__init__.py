from datetime import date as DateValue, datetime, time, timezone
from typing import Any

from sqlalchemy import JSON, CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, Time, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    # UTC stored without tzinfo consistently on both SQLite and PostgreSQL.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('member','admin')", name="ck_user_role"),
        CheckConstraint("membership_status IN ('pending','approved','rejected','suspended')", name="ck_membership_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="member")
    membership_status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class JoinApplication(Base):
    __tablename__ = "join_applications"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_application_status"),
        Index("uq_pending_application", "user_id", unique=True, sqlite_where=text("status = 'pending'"), postgresql_where=text("status = 'pending'")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    school: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text)
    discovery: Mapped[str] = mapped_column(String(500))
    contact: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    target_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    application_id: Mapped[int | None] = mapped_column(ForeignKey("join_applications.id"))
    action: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Competition(Base):
    __tablename__ = "competitions"
    __table_args__ = (CheckConstraint("publication_status IN ('published','archived','draft')", name="ck_competition_publication"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    edition: Mapped[str] = mapped_column(String(80))
    year: Mapped[int]
    summary: Mapped[str] = mapped_column(Text)
    eligibility: Mapped[str] = mapped_column(Text)
    publication_status: Mapped[str] = mapped_column(String(16))
    # Editorial fields retained without losing the first edition's evidence/analysis.
    details: Mapped[dict[str, Any]] = mapped_column(JSON)


class Track(Base):
    __tablename__ = "tracks"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    requirements: Mapped[str] = mapped_column(Text)
    analysis: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(JSON)


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (UniqueConstraint("competition_id", "source_key", name="uq_competition_source"),)
    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    source_key: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(80))
    checked_at: Mapped[DateValue] = mapped_column(Date)
    published_at: Mapped[DateValue | None] = mapped_column(Date)


class Milestone(Base):
    __tablename__ = "milestones"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), index=True)
    track_id: Mapped[str | None] = mapped_column(ForeignKey("tracks.id"))
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    kind: Mapped[str] = mapped_column(String(100))
    date: Mapped[DateValue | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[DateValue | None] = mapped_column(Date, nullable=True)
    exact_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    timezone: Mapped[str | None] = mapped_column(String(80))
    evidence_text: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(JSON)


class MilestoneTrack(Base):
    __tablename__ = "milestone_tracks"
    milestone_id: Mapped[str] = mapped_column(ForeignKey("milestones.id"), primary_key=True)
    track_id: Mapped[str] = mapped_column(ForeignKey("tracks.id"), primary_key=True)


class MilestoneSource(Base):
    __tablename__ = "milestone_sources"
    milestone_id: Mapped[str] = mapped_column(ForeignKey("milestones.id"), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), primary_key=True)


class Favorite(Base):
    __tablename__ = "favorites"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    competition_id: Mapped[str] = mapped_column(ForeignKey("competitions.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RateLimitBucket(Base):
    __tablename__ = "rate_limit_buckets"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int]
    expires_at: Mapped[datetime] = mapped_column(DateTime)
