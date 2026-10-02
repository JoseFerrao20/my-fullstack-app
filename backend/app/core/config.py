from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://taskapp:taskapp@localhost:5432/taskapp"
    jwt_secret: str = "dev-only-insecure-secret-change-me-in-production"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
