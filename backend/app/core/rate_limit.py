import time
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import token_hash
from app.models import RateLimitBucket, utcnow


def check_rate_limit(db: Session, request: Request, action: str, limit: int, username: str = "") -> None:
    settings = get_settings()
    window = int(time.time()) // settings.rate_window_seconds
    # Database counters are shared across workers. Do not trust arbitrary X-Forwarded-For.
    ip = request.client.host if request.client else "unknown"
    keys = [token_hash(f"{action}:ip:{ip}:{window}")]
    if username:
        keys.append(token_hash(f"{action}:account:{username}:{window}"))
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    counts = []
    db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at < utcnow()))
    for key in keys:
        statement = insert(RateLimitBucket).values(key=key, count=1, expires_at=utcnow() + timedelta(seconds=settings.rate_window_seconds * 2))
        statement = statement.on_conflict_do_update(index_elements=[RateLimitBucket.key], set_={"count": RateLimitBucket.count + 1}).returning(RateLimitBucket.count)
        counts.append(db.scalar(statement))
    db.commit()  # Failed authentication must still consume a rate-limit attempt.
    if any(count > limit for count in counts):
        raise HTTPException(429, "操作过于频繁，请稍后重试", headers={"Retry-After": str(settings.rate_window_seconds)})
