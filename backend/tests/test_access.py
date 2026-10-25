from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings, get_settings
from app.core.security import SESSION_COOKIE, token_hash
from app.models import AuditLog, Favorite, JoinApplication, Subscription, User, UserSession, utcnow
from conftest import PASSWORD, approve, client_for, login, register

CMP = "cmp-service-outsourcing"


def test_guest_public_and_personal_access(environment):
    app, _, _ = environment
    with client_for(app) as guest:
        assert guest.get("/api/competitions").json()["total"] == 3
        assert guest.get("/api/competitions/service-outsourcing").status_code == 200
        assert guest.get("/api/competitions/missing").status_code == 404
        for path in ["/api/me", "/api/me/application", "/api/me/favorites", "/api/admin/applications", "/api/admin/members"]:
            assert guest.get(path).status_code == 401


def test_registration_atomic_normalized_and_no_privilege_escalation(environment):
    app, factory, _ = environment
    with client_for(app) as client:
        result = register(client, "ＡLICE")
        assert result.status_code == 201
        assert result.json()["user"]["username"] == "alice"
        assert result.json()["user"]["membership_status"] == "pending"
        assert "password_hash" not in result.json()["user"]
        assert register(client, "alice").status_code == 409
        assert register(client, "evil", role="admin").status_code == 422
        assert register(client, "evil", membership_status="approved").status_code == 422
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(JoinApplication)) == 1
        user = db.scalar(select(User).where(User.username == "alice"))
        assert user.password_hash.startswith("$argon2")
        assert user.role == "member"
        assert db.scalar(select(func.count()).select_from(UserSession)) == 1


def test_register_rollback_when_application_insert_fails(environment):
    from sqlalchemy import event
    app, factory, _ = environment
    def fail_application(*_args):
        raise IntegrityError("forced", {}, Exception("forced application failure"))
    event.listen(JoinApplication, "before_insert", fail_application)
    try:
        with client_for(app) as client:
            assert register(client).status_code == 409
    finally:
        event.remove(JoinApplication, "before_insert", fail_application)
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "alice")) is None
        assert db.scalar(select(func.count()).select_from(JoinApplication)) == 0
        assert db.scalar(select(func.count()).select_from(UserSession)) == 0


def test_pending_and_rejected_cannot_interact(clients):
    member, admin, _ = clients
    for kind in ["favorites", "subscriptions"]:
        assert member.put(f"/api/me/{kind}/{CMP}").status_code == 403
    assert approve(admin, member, "rejected").status_code == 200
    assert member.get("/api/me").json()["membership_status"] == "rejected"
    assert member.get("/api/me/application").json()["review_note"] == "资料已审核"
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 403


def test_review_repeat_and_audit_atomic(clients):
    member, admin, factory = clients
    assert approve(admin, member).status_code == 200
    assert approve(admin, member, "rejected").status_code == 409
    assert member.get("/api/me").json()["membership_status"] == "approved"
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog)) == 1


def test_review_rollback_if_audit_write_fails(clients):
    from sqlalchemy import event
    member, admin, factory = clients
    def fail_audit(*_args):
        raise RuntimeError("forced audit failure")
    event.listen(AuditLog, "before_insert", fail_audit)
    try:
        with pytest.raises(RuntimeError):
            approve(admin, member)
    finally:
        event.remove(AuditLog, "before_insert", fail_audit)
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "alice")).membership_status == "pending"
        assert db.scalar(select(JoinApplication)).status == "pending"
        assert db.scalar(select(func.count()).select_from(AuditLog)) == 0


def test_concurrent_review_executes_once(clients, environment):
    member, admin, factory = clients
    app, _, _ = environment
    second_admin = client_for(app)
    assert login(second_admin).status_code == 200
    application_id = member.get("/api/me/application").json()["id"]
    def review(client):
        return client.post(f"/api/admin/applications/{application_id}/review", json={"decision": "approved", "note": "并发审核"}).status_code
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(review, [admin, second_admin]))
    assert sorted(results) == [200, 409]
    second_admin.close()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog)) == 1


def test_relations_independent_idempotent_and_persist_across_sessions(clients, environment):
    member, admin, factory = clients
    app, _, _ = environment
    assert approve(admin, member).status_code == 200
    for kind in ["favorites", "subscriptions"]:
        assert member.put(f"/api/me/{kind}/{CMP}").status_code == 204
        assert member.put(f"/api/me/{kind}/{CMP}").status_code == 204
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Favorite)) == 1
        assert db.scalar(select(func.count()).select_from(Subscription)) == 1
    with client_for(app) as device:
        assert login(device, "alice").status_code == 200
        entry = device.get("/api/me/competitions").json()["items"][0]
        assert entry["favorite"] and entry["subscribed"]
        assert entry["competition"]["publicationStatus"] == "archived"
        assert device.delete(f"/api/me/favorites/{CMP}").status_code == 204
        assert device.delete(f"/api/me/favorites/{CMP}").status_code == 204
        assert device.get("/api/me/favorites").json()["items"] == []
        assert device.get("/api/me/subscriptions").json()["total"] == 1
        assert member.get("/api/me/competitions").json()["items"][0]["favorite"] is False


def test_relations_reject_unknown_or_draft(clients):
    from app.models import Competition
    member, admin, factory = clients
    assert approve(admin, member).status_code == 200
    assert member.put("/api/me/favorites/missing").status_code == 404
    with factory() as db:
        db.get(Competition, CMP).publication_status = "draft"
        db.commit()
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 404
    assert member.get("/api/competitions/service-outsourcing").status_code == 404


def test_suspend_blocks_old_sessions_and_restore_keeps_relations(clients):
    member, admin, factory = clients
    assert approve(admin, member).status_code == 200
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 204
    user_id = member.get("/api/me").json()["id"]
    assert admin.post(f"/api/admin/members/{user_id}/suspend", json={"reason": "资格暂停"}).status_code == 200
    assert member.get("/api/me").status_code == 200
    for kind in ["favorites", "subscriptions"]:
        assert member.put(f"/api/me/{kind}/{CMP}").status_code == 403
        assert member.delete(f"/api/me/{kind}/{CMP}").status_code == 403
    assert member.get("/api/me/competitions").status_code == 403
    assert admin.post(f"/api/admin/members/{user_id}/suspend", json={"reason": "重复"}).status_code == 409
    assert admin.post(f"/api/admin/members/{user_id}/restore", json={"reason": "恢复资格"}).status_code == 200
    assert member.get("/api/me/competitions").json()["total"] == 1
    assert admin.post(f"/api/admin/members/{user_id}/restore", json={"reason": "重复"}).status_code == 409
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuditLog)) == 3


def test_rejected_can_reapply_once_preserving_history(clients):
    member, admin, factory = clients
    assert approve(admin, member, "rejected").status_code == 200
    old = member.get("/api/me/application").json()
    payload = {"school": "学院", "reason": "补充申请理由", "discovery": "官网", "contact": None}
    assert member.post("/api/me/application", json=payload).status_code == 201
    assert member.post("/api/me/application", json=payload).status_code == 409
    current = member.get("/api/me/application").json()
    assert current["id"] != old["id"] and current["status"] == "pending"
    assert approve(admin, member).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(JoinApplication)) == 2
        assert db.get(JoinApplication, old["id"]).review_note == "资料已审核"


def test_member_cannot_manage_or_read_other_members(clients, environment):
    member, admin, _ = clients
    assert approve(admin, member).status_code == 200
    app, _, _ = environment
    with client_for(app) as other:
        assert register(other, "bob").status_code == 201
        other_id = other.get("/api/me").json()["id"]
        assert member.get(f"/api/me?user_id={other_id}").json()["username"] == "alice"
        assert member.get("/api/me/application?user_id=" + str(other_id)).json()["reason"] == "希望参加社区项目"
        for path in ["/api/admin/applications", "/api/admin/applications/1", "/api/admin/members"]:
            assert member.get(path).status_code == 403
        assert member.post(f"/api/admin/members/{other_id}/suspend", json={"reason": "越权"}).status_code == 403
        assert member.post("/api/admin/applications/1/review", json={"decision": "approved", "note": "越权"}).status_code == 403
        assert member.put(f"/api/me/favorites/{CMP}", json={"user_id": other_id}).status_code == 204
        assert approve(admin, other).status_code == 200
        assert other.get("/api/me/favorites").json()["total"] == 0


def test_logout_revokes_server_session_and_expiry(clients, environment):
    member, _, factory = clients
    app, _, _ = environment
    credential = member.cookies.get(SESSION_COOKIE)
    with factory() as db:
        session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(credential)))
        assert session.token_hash != credential
    assert member.post("/api/auth/logout").status_code == 204
    member.cookies.set(SESSION_COOKIE, credential)
    assert member.get("/api/me").status_code == 401
    with client_for(app) as device:
        assert login(device, "alice").status_code == 200
        token = device.cookies.get(SESSION_COOKIE)
        with factory() as db:
            db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token))).expires_at = utcnow() - timedelta(seconds=1)
            db.commit()
        assert device.get("/api/me").status_code == 401


def test_csrf_origin_cookie_flags_and_private_cache(clients, environment):
    member, admin, _ = clients
    assert approve(admin, member).status_code == 200
    saved = member.headers.pop("x-csrf-token")
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 403
    member.headers["x-csrf-token"] = "bad-token"
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 403
    member.headers["x-csrf-token"] = saved
    member.headers["origin"] = "https://evil.example"
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 403
    app, _, _ = environment
    with client_for(app) as client:
        result = login(client)
        assert all("HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api" in cookie for cookie in result.headers.get_list("set-cookie"))
        assert client.get("/api/me").headers["cache-control"] == "no-store"
        client.headers.pop("x-csrf-token")
        assert login(client).status_code == 403


def test_rate_limits_shared_between_clients(environment, monkeypatch):
    app, _, _ = environment
    monkeypatch.setenv("CODEHIVE_LOGIN_LIMIT", "2")
    monkeypatch.setenv("CODEHIVE_REGISTRATION_LIMIT", "1")
    get_settings.cache_clear()
    with client_for(app) as one, client_for(app) as two:
        assert login(one, "admin", "incorrect").status_code == 401
        assert login(two, "admin", "incorrect").status_code == 401
        limited = login(one, "admin")
        assert limited.status_code == 429 and "retry-after" in limited.headers
        assert register(one).status_code == 201
        assert register(two, "bob").status_code == 429


def test_contact_optional_and_required_configuration(environment, monkeypatch):
    app, _, _ = environment
    with client_for(app) as client:
        assert register(client).status_code == 201
    monkeypatch.setenv("CODEHIVE_CONTACT_REQUIRED", "true")
    get_settings.cache_clear()
    with client_for(app) as client:
        assert register(client, "bob").status_code == 422
        assert register(client, "bob", contact="可联系地址").status_code == 201


def test_production_configuration_requires_secure_postgres():
    with pytest.raises(ValueError):
        Settings(environment="production", cookie_secure=False)
    assert Settings(environment="production", cookie_secure=True, database_url="postgresql+psycopg://localhost/codehive", allowed_origins=["https://codehive.example"]).cookie_secure


def test_parallel_favorites_and_subscriptions_do_not_duplicate(clients, environment):
    member, admin, factory = clients
    assert approve(admin, member).status_code == 200
    app, _, _ = environment
    other = client_for(app)
    assert login(other, "alice").status_code == 200
    for kind, model in [("favorites", Favorite), ("subscriptions", Subscription)]:
        with ThreadPoolExecutor(2) as pool:
            statuses = list(pool.map(lambda client: client.put(f"/api/me/{kind}/{CMP}").status_code, [member, other]))
        assert statuses == [204, 204]
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(model)) == 1
    other.close()


def test_concurrent_reapplication_has_one_pending_application(clients, environment):
    member, admin, factory = clients
    assert approve(admin, member, "rejected").status_code == 200
    app, _, _ = environment
    other = client_for(app)
    assert login(other, "alice").status_code == 200
    payload = {"school": "学院", "reason": "重新申请", "discovery": "同学"}
    with ThreadPoolExecutor(2) as pool:
        statuses = list(pool.map(lambda client: client.post("/api/me/application", json=payload).status_code, [member, other]))
    assert sorted(statuses) == [201, 409]
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(JoinApplication).where(JoinApplication.status == "pending")) == 1
    other.close()


def test_session_csrf_is_bound_not_only_double_submit(clients):
    member, admin, _ = clients
    assert approve(admin, member).status_code == 200
    from app.core.security import CSRF_COOKIE
    credential = member.cookies.get(SESSION_COOKIE)
    member.cookies.clear()
    # Preserve session but replace both CSRF values with an attacker chosen token.
    member.cookies.set(SESSION_COOKIE, credential, domain="testserver.local", path="/api")
    member.cookies.set(CSRF_COOKIE, "attacker-chosen", domain="testserver.local", path="/api")
    member.headers["x-csrf-token"] = "attacker-chosen"
    assert member.get("/api/me").status_code == 200
    assert member.put(f"/api/me/favorites/{CMP}").status_code == 403


def test_password_whitespace_preserved_and_blank_profile_rejected(environment):
    app, _, _ = environment
    with client_for(app) as client:
        assert register(client, password="  test-password-123  ").status_code == 201
    with client_for(app) as other:
        assert login(other, "alice", "test-password-123").status_code == 401
        assert login(other, "alice", "  test-password-123  ").status_code == 200
        assert register(other, "bob", reason="   ").status_code == 422


def test_admin_self_suspend_and_suspended_admin_denied(clients):
    member, admin, factory = clients
    admin_id = admin.get("/api/me").json()["id"]
    assert admin.post(f"/api/admin/members/{admin_id}/suspend", json={"reason": "自己暂停"}).status_code == 409
    with factory() as db:
        db.get(User, admin_id).membership_status = "suspended"
        db.commit()
    assert admin.get("/api/admin/applications").status_code == 403
    assert approve(admin, member).status_code == 403
