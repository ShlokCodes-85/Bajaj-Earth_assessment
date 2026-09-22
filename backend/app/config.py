from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    frontend_origin: str = "http://localhost:5173"
    poll_interval_seconds: int = 10
    demo_sheet_id: str = ""
    google_service_account_json: str = ""
    google_oauth_client_json: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    session_secret: str = "replace-me"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
