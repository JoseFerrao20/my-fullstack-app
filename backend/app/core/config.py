from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # "production" turns on the safety checks in production_problems().
    environment: Literal["development", "production"] = "development"

    database_url: str = "postgresql+psycopg://taskapp:taskapp@localhost:5432/taskapp"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    cookie_secure: bool = False
    enable_scheduler: bool = True
    notification_interval_seconds: int = 60
    due_soon_window_hours: int = 24

    # Email (Mailpit in docker-compose catches everything in development).
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False
    mail_from: str = "Task Manager <no-reply@taskmanager.local>"
    # Public URL of the frontend, used to build links in emails.
    app_base_url: str = "http://localhost"
    password_reset_ttl_minutes: int = 60

    # Web Push (VAPID). Without both keys, push notifications are simply turned off.
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:admin@taskmanager.local"

    # End-to-end tests only: every request comes from one IP, so real limits would block reruns.
    # Never set this in production (the production checks refuse to start with it).
    disable_rate_limits: bool = False

    @property
    def push_enabled(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key)

    def production_problems(self) -> list[str]:
        """Settings that are fine for development but unsafe in production."""
        if self.environment != "production":
            return []
        problems = []
        if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be set to a random value of at least 32 characters")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true (cookies only over HTTPS)")
        if not self.app_base_url.startswith("https://"):
            problems.append("APP_BASE_URL must be the public https:// address (it's used in emails)")
        if self.disable_rate_limits:
            problems.append("DISABLE_RATE_LIMITS is for end-to-end tests only")
        if self.smtp_host in ("localhost", "mailpit"):
            problems.append("SMTP_HOST points at a development mail catcher; set a real SMTP server")
        return problems


def check_production_settings(settings: Settings) -> None:
    """Refuse to start a misconfigured production server (called when the app is created)."""
    problems = settings.production_problems()
    if problems:
        raise RuntimeError("Refusing to start in production:\n- " + "\n- ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
