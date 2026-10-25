from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AuditLog, JoinApplication, User, utcnow
from app.modules.membership.schemas import ReapplyInput, ReviewInput
from app.core.config import get_settings


def review(db: Session, application_id: int, admin: User, payload: ReviewInput) -> JoinApplication:
    application = db.get(JoinApplication, application_id)
    if application is None:
        raise HTTPException(404, "申请不存在")
    if application.user_id == admin.id:
        raise HTTPException(409, "不能审核自己的申请")
    changed = db.execute(update(JoinApplication).where(JoinApplication.id == application_id, JoinApplication.status == "pending")
                         .values(status=payload.decision, reviewer_id=admin.id, review_note=payload.note, reviewed_at=utcnow()))
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "申请已经审核，请刷新列表")
    changed_user = db.execute(update(User).where(User.id == application.user_id, User.membership_status == "pending")
                             .values(membership_status=payload.decision))
    if changed_user.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "成员状态已改变，无法执行本次审核")
    db.add(AuditLog(admin_id=admin.id, target_user_id=application.user_id, application_id=application_id,
                    action=payload.decision, reason=payload.note))
    db.commit()
    db.refresh(application)
    return application


def suspend(db: Session, user_id: int, admin: User, reason: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "用户不存在")
    if user.id == admin.id:
        raise HTTPException(409, "不能暂停自己的管理员资格")
    result = db.execute(update(User).where(User.id == user_id, User.membership_status == "approved")
                        .values(membership_status="suspended"))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "仅可暂停已批准成员")
    db.add(AuditLog(admin_id=admin.id, target_user_id=user_id, action="suspended", reason=reason))
    db.commit()
    db.refresh(user)
    return user


def restore(db: Session, user_id: int, admin: User, reason: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "用户不存在")
    result = db.execute(update(User).where(User.id == user_id, User.membership_status == "suspended")
                        .values(membership_status="approved"))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "仅可恢复已暂停成员")
    db.add(AuditLog(admin_id=admin.id, target_user_id=user_id, action="restored", reason=reason))
    db.commit()
    db.refresh(user)
    return user


def reapply(db: Session, user: User, payload: ReapplyInput) -> JoinApplication:
    if get_settings().contact_required and not payload.contact:
        raise HTTPException(422, "请填写联系方式")
    result = db.execute(update(User).where(User.id == user.id, User.membership_status == "rejected")
                        .values(membership_status="pending"))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "仅被拒绝的账号可以重新申请")
    application = JoinApplication(user_id=user.id, **payload.model_dump())
    try:
        db.add(application)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "已经有待审核申请") from None
    return application
