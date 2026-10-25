import argparse
import getpass

from sqlalchemy import select

from app.core.database import SessionFactory
from app.core.security import normalize_username, password_hasher
from app.models import User
from app.modules.auth.schemas import LoginInput


def main() -> None:
    parser = argparse.ArgumentParser(description="code-hive local initialization")
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--username", required=True)
    parser.add_argument("--display-name", required=True)
    args = parser.parse_args()
    password = getpass.getpass("Admin password (10–128 characters): ")
    if password != getpass.getpass("Confirm password: ") or not 10 <= len(password) <= 128:
        parser.error("密码不一致或长度不符合要求")
    username = LoginInput(username=args.username, password=password).username
    if not args.display_name.strip() or len(args.display_name.strip()) > 80:
        parser.error("显示称呼需为 1–80 字")
    with SessionFactory() as db:
        if db.scalar(select(User).where(User.username == normalize_username(username))):
            parser.error("账号已存在；初始化命令不会提升已有账号权限")
        db.add(User(username=username, display_name=args.display_name.strip(), password_hash=password_hasher.hash(password), role="admin", membership_status="approved"))
        db.commit()
    print("Approved administrator created locally.")


if __name__ == "__main__":
    main()
