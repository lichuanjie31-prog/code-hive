import hashlib
import secrets
import unicodedata

from fastapi import HTTPException, Request, Response
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))
SESSION_COOKIE = "codehive_session"
CSRF_COOKIE = "codehive_csrf"


def normalize_username(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def set_cookie(response: Response, name: str, value: str, *, http_only: bool) -> None:
    settings = get_settings()
    response.set_cookie(name, value, httponly=http_only, secure=settings.cookie_secure,
                        samesite="lax", max_age=settings.session_hours * 3600, path="/api")


def require_csrf(request: Request) -> str:
    origin = request.headers.get("origin")
    if origin and origin not in get_settings().allowed_origins:
        raise HTTPException(403, "请求来源不受信任")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "不允许跨站请求")
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get("x-csrf-token", "")
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        raise HTTPException(403, "CSRF 校验失败，请刷新页面后重试")
    return header
