import secrets
from datetime import timedelta

from fastapi import HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import CSRF_COOKIE, DUMMY_HASH, SESSION_COOKIE, password_hasher, set_cookie, token_hash
from app.models import JoinApplication, User, UserSession, utcnow
from app.modules.auth.schemas import AuthView, LoginInput, RegisterInput, UserView


def create_session(db: Session, user: User, response: Response) -> AuthView:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(UserSession(user_id=user.id, token_hash=token_hash(token), csrf_hash=token_hash(csrf),
                       expires_at=utcnow() + timedelta(hours=get_settings().session_hours)))
    db.commit()
    set_cookie(response, SESSION_COOKIE, token, http_only=True)
    set_cookie(response, CSRF_COOKIE, csrf, http_only=True)
    return AuthView(user=UserView.model_validate(user), csrf_token=csrf)


def register(db: Session, payload: RegisterInput, response: Response) -> AuthView:
    if get_settings().contact_required and not payload.contact:
        raise HTTPException(422, "请填写联系方式")
    user = User(username=payload.username, display_name=payload.display_name,
                password_hash=password_hasher.hash(payload.password), role="member", membership_status="pending")
    try:
        db.add(user)
        db.flush()
        db.add(JoinApplication(user_id=user.id, school=payload.school, reason=payload.reason,
                               discovery=payload.discovery, contact=payload.contact or None))
        # Account, application and initial session commit together.
        return create_session(db, user, response)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "登录名已存在") from None


def login(db: Session, payload: LoginInput, response: Response) -> AuthView:
    user = db.scalar(select(User).where(User.username == payload.username))
    valid = password_hasher.verify(payload.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(401, "登录名或密码错误")
    return create_session(db, user, response)
