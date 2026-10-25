import secrets

from fastapi import APIRouter, Depends, Request, Response

from app.core.config import get_settings
from app.core.permissions import Db, LoginUser
from app.core.rate_limit import check_rate_limit
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, require_csrf, set_cookie
from app.models import utcnow
from app.modules.auth import service
from app.modules.auth.schemas import AuthView, CsrfView, LoginInput, RegisterInput, UserView

router = APIRouter()


@router.get("/api/auth/csrf", response_model=CsrfView)
def csrf(request: Request, response: Response) -> CsrfView:
    token = request.cookies.get(CSRF_COOKIE) or secrets.token_urlsafe(32)
    set_cookie(response, CSRF_COOKIE, token, http_only=True)
    response.headers["Cache-Control"] = "no-store"
    return CsrfView(csrf_token=token, contact_required=get_settings().contact_required)


@router.post("/api/auth/register", response_model=AuthView, status_code=201, dependencies=[Depends(require_csrf)])
def register(payload: RegisterInput, request: Request, response: Response, db: Db) -> AuthView:
    check_rate_limit(db, request, "register", get_settings().registration_limit)
    return service.register(db, payload, response)


@router.post("/api/auth/login", response_model=AuthView, dependencies=[Depends(require_csrf)])
def login(payload: LoginInput, request: Request, response: Response, db: Db) -> AuthView:
    check_rate_limit(db, request, "login", get_settings().login_limit, payload.username)
    return service.login(db, payload, response)


@router.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Db, user: LoginUser) -> None:
    request.state.session.revoked_at = utcnow()
    db.commit()
    for name in (SESSION_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, path="/api", secure=get_settings().cookie_secure, httponly=True, samesite="lax")


@router.get("/api/me", response_model=UserView)
def me(user: LoginUser) -> UserView:
    return UserView.model_validate(user)
