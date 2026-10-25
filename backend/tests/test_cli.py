import sys

from sqlalchemy import select
import pytest

from app.core.security import password_hasher
from app.models import User


def test_cli_creates_admin_and_never_promotes_existing_accounts(environment, monkeypatch):
    from app import cli
    _, factory, _ = environment
    monkeypatch.setattr(cli, "SessionFactory", factory)
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: "cli-password-123")
    monkeypatch.setattr(sys, "argv", ["cli", "create-admin", "--username", "new-admin", "--display-name", "新管理员"])
    cli.main()
    with factory() as db:
        admin = db.scalar(select(User).where(User.username == "new-admin"))
        assert admin.role == "admin" and admin.membership_status == "approved"
        assert password_hasher.verify("cli-password-123", admin.password_hash)
    with pytest.raises(SystemExit):
        cli.main()
