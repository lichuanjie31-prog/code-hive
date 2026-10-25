from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select

from app.core.permissions import AdminUser, Db, LoginUser
from app.models import JoinApplication, User
from app.modules.auth.schemas import UserView
from app.modules.membership import service
from app.modules.membership.schemas import AdminApplicationView, ApplicationView, ReapplyInput, ReviewInput, SuspendInput
from app.core.rate_limit import check_rate_limit
from app.core.config import get_settings

router = APIRouter()


@router.get("/api/me/application", response_model=ApplicationView | None)
def my_application(db: Db, user: LoginUser) -> JoinApplication | None:
    return db.scalar(select(JoinApplication).where(JoinApplication.user_id == user.id).order_by(JoinApplication.id.desc()).limit(1))


def application_view(db: Db, application: JoinApplication) -> AdminApplicationView:
    return AdminApplicationView(**ApplicationView.model_validate(application).model_dump(), applicant=UserView.model_validate(db.get(User, application.user_id)))


@router.get("/api/admin/applications", response_model=list[AdminApplicationView])
def applications(db: Db, admin: AdminUser, status: Literal["pending", "approved", "rejected"] = "pending", offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)) -> list[AdminApplicationView]:
    items = db.scalars(select(JoinApplication).where(JoinApplication.status == status).order_by(JoinApplication.id).offset(offset).limit(limit))
    return [application_view(db, item) for item in items]


@router.get("/api/admin/applications/{application_id}", response_model=AdminApplicationView)
def application_detail(application_id: int, db: Db, admin: AdminUser) -> AdminApplicationView:
    application = db.get(JoinApplication, application_id)
    if application is None:
        raise HTTPException(404, "申请不存在")
    return application_view(db, application)


@router.post("/api/admin/applications/{application_id}/review", response_model=ApplicationView)
def review(application_id: int, payload: ReviewInput, db: Db, admin: AdminUser) -> JoinApplication:
    return service.review(db, application_id, admin, payload)


@router.get("/api/admin/members", response_model=list[UserView])
def members(db: Db, admin: AdminUser, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)) -> list[User]:
    return list(db.scalars(select(User).where(User.membership_status.in_(["approved", "suspended"])).order_by(User.id).offset(offset).limit(limit)))


@router.post("/api/admin/members/{user_id}/suspend", response_model=UserView)
def suspend(user_id: int, payload: SuspendInput, db: Db, admin: AdminUser) -> User:
    return service.suspend(db, user_id, admin, payload.reason)


@router.post("/api/admin/members/{user_id}/restore", response_model=UserView)
def restore(user_id: int, payload: SuspendInput, db: Db, admin: AdminUser) -> User:
    return service.restore(db, user_id, admin, payload.reason)


@router.post("/api/me/application", response_model=ApplicationView, status_code=201)
def reapply(payload: ReapplyInput, request: Request, db: Db, user: LoginUser) -> JoinApplication:
    check_rate_limit(db, request, "reapply", get_settings().registration_limit, str(user.id))
    return service.reapply(db, user, payload)
