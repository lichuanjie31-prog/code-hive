"""Create an isolated temporary browser-test database; never seed a real database."""
import os
import tempfile
from pathlib import Path


def main() -> None:
    db_path = Path(tempfile.mkdtemp(prefix="codehive-member-ui-")) / "browser.db"
    os.environ["CODEHIVE_DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    from alembic import command
    from alembic.config import Config
    from app.core.database import SessionFactory
    from app.core.security import password_hasher
    from app.models import User
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    with SessionFactory() as db:
        db.add(User(username="qa-admin", display_name="测试管理员", password_hash=password_hasher.hash("qa-password-123"), role="admin", membership_status="approved"))
        db.commit()
    print(os.environ["CODEHIVE_DATABASE_URL"])


if __name__ == "__main__":
    main()
