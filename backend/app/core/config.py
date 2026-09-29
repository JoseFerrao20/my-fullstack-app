from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://taskapp:taskapp@localhost:5432/taskapp"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    cookie_secure: bool = False
    enable_scheduler: bool = True
    notification_interval_seconds: int = 60
    due_soon_window_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
