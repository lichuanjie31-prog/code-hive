import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import SESSION_COOKIE, require_csrf, token_hash
from app.models import User, UserSession, utcnow

Db = Annotated[Session, Depends(get_db)]


def require_login(request: Request, db: Db) -> User:
    credential = request.cookies.get(SESSION_COOKIE, "")
    session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(credential),
                                                UserSession.revoked_at.is_(None), UserSession.expires_at > utcnow())) if credential else None
    if session is None:
        raise HTTPException(401, "请先登录，会话可能已过期")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf = require_csrf(request)
        if not secrets.compare_digest(session.csrf_hash, token_hash(csrf)):
            raise HTTPException(403, "会话 CSRF 校验失败")
    request.state.session = session
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(401, "账号不存在")
    return user


def require_member(request: Request, db: Db, user: Annotated[User, Depends(require_login)]) -> User:
    if user.membership_status != "approved":
        raise HTTPException(403, "成员资格尚未批准或已暂停")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        # Serialize membership-changing admin transactions with member writes.
        result = db.execute(update(User).where(User.id == user.id, User.membership_status == "approved")
                            .values(membership_status=User.membership_status))
        if result.rowcount != 1:
            raise HTTPException(403, "成员资格已改变，请刷新页面")
    return user


def require_admin(user: Annotated[User, Depends(require_member)]) -> User:
    if user.role != "admin":
        raise HTTPException(403, "需要管理员权限")
    return user


LoginUser = Annotated[User, Depends(require_login)]
MemberUser = Annotated[User, Depends(require_member)]
AdminUser = Annotated[User, Depends(require_admin)]
