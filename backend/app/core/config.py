from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CODEHIVE_", extra="ignore")

    database_url: str = "sqlite:///./codehive-v2.db"
    environment: str = "development"
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"]
    cookie_secure: bool = False
    session_hours: int = 168
    contact_required: bool = False
    login_limit: int = 10
    registration_limit: int = 5
    rate_window_seconds: int = 900

    @model_validator(mode="after")
    def production_settings(self) -> "Settings":
        if self.environment == "production":
            if not self.cookie_secure or not self.database_url.startswith("postgresql"):
                raise ValueError("生产环境要求 PostgreSQL 与 Secure Cookie")
            if not self.allowed_origins or any(not x.startswith("https://") for x in self.allowed_origins):
                raise ValueError("生产环境 allowed_origins 必须为 HTTPS 来源")
        if min(self.session_hours, self.login_limit, self.registration_limit, self.rate_window_seconds) <= 0:
            raise ValueError("会话与频率限制必须为正数")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
