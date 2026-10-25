from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.database import get_db, make_engine
from app.core.security import password_hasher
from app.main import create_app
from app.models import User

ROOT = Path(__file__).parents[1]
PASSWORD = "test-password-123"


@pytest.fixture
def environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    monkeypatch.setenv("CODEHIVE_DATABASE_URL", url)
    monkeypatch.setenv("CODEHIVE_LOGIN_LIMIT", "100")
    monkeypatch.setenv("CODEHIVE_REGISTRATION_LIMIT", "100")
    get_settings.cache_clear()
    config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    engine = make_engine(url)
    factory = sessionmaker(engine, expire_on_commit=False)

    def test_db() -> Iterator[Session]:
        with factory() as db:
            yield db

    app = create_app()
    app.dependency_overrides[get_db] = test_db
    with factory() as db:
        db.add(User(username="admin", display_name="管理员", password_hash=password_hasher.hash(PASSWORD), role="admin", membership_status="approved"))
        db.commit()
    yield app, factory, config
    engine.dispose()
    get_settings.cache_clear()


def client_for(app) -> TestClient:
    client = TestClient(app)
    client.headers["origin"] = "http://127.0.0.1:5173"
    result = client.get("/api/auth/csrf")
    assert result.status_code == 200
    client.headers["x-csrf-token"] = result.json()["csrf_token"]
    return client


def register(client: TestClient, username: str = "alice", **extra):
    result = client.post("/api/auth/register", json={"username": username, "password": PASSWORD,
                         "display_name": "测试成员", "school": "计算机学院", "reason": "希望参加社区项目",
                         "discovery": "同学推荐", **extra})
    if result.status_code == 201:
        client.headers["x-csrf-token"] = result.json()["csrf_token"]
    return result


def login(client: TestClient, username: str = "admin", password: str = PASSWORD):
    result = client.post("/api/auth/login", json={"username": username, "password": password})
    if result.status_code == 200:
        client.headers["x-csrf-token"] = result.json()["csrf_token"]
    return result


def approve(admin: TestClient, applicant: TestClient, decision: str = "approved"):
    application_id = applicant.get("/api/me/application").json()["id"]
    return admin.post(f"/api/admin/applications/{application_id}/review", json={"decision": decision, "note": "资料已审核"})


@pytest.fixture
def clients(environment):
    app, factory, config = environment
    member, admin = client_for(app), client_for(app)
    assert register(member).status_code == 201
    assert login(admin).status_code == 200
    yield member, admin, factory
    member.close()
    admin.close()
