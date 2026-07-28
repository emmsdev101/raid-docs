"""Application configuration via Pydantic BaseSettings.

All settings are read from environment variables (or a local `.env` file).
Do not hardcode secrets — override via environment for each deployment.
"""

from functools import lru_cache
from typing import List

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────
    app_name: str = "RAID Docs API"
    app_env: str = Field(default="development")
    debug: bool = Field(default=False)
    api_v1_prefix: str = "/api/v1"
    

    # ── CORS ───────────────────────────────────────────────────────────
    cors_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # ── Database (raw PostgreSQL via asyncpg — no ORM) ─────────────────
    database_url: PostgresDsn = Field(
        default="postgresql://postgres:postgres@localhost:5432/raid_docs"
    )

    # ── Redis / Celery ─────────────────────────────────────────────────
    # `celery_enabled` gates whether the API dispatches ingestion to a Celery
    # worker (requires Redis) or runs it inline via FastAPI BackgroundTasks.
    # Inline mode is convenient for local dev and small deployments; flip to
    # True once you're actually running `celery -A app.core.celery_app worker`.
    celery_enabled: bool = Field(default=False)
    redis_url: RedisDsn = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/1")
    celery_result_backend: str = Field(default="redis://localhost:6379/2")

    # ── Ingestion ───────────────────────────────────────────────────────
    # The interval at which the ingestion worker sweeps the database for pending
    # ingestion tasks.
    ingestion_sweep_interval_seconds: int = 15
    # The minimum age of a pending ingestion task before it is considered stale.
    ingestion_pending_min_age_seconds: int = 30
    # The maximum age of a processing ingestion task before it is considered stale.
    ingestion_processing_stale_minutes: int = 20

    # ── Auth (Clerk / JWT) ─────────────────────────────────────────────
    # Two auth modes are supported:
    #   1. Local password auth (default): the API mints HS256 tokens signed
    #      with `jwt_secret_key`. Set that to a long random value in prod.
    #   2. External IdP (e.g. Clerk): set `clerk_jwks_url` (+ optionally
    #      `jwt_audience` / `jwt_issuer`) and tokens will be verified via
    #      JWKS with `jwt_algorithm` (default RS256).
    jwt_algorithm: str = "HS256"
    jwt_audience: str | None = None
    jwt_issuer: str = "raid-docs"
    jwt_secret_key: str = Field(
        default="dev-insecure-change-me-in-production-please"
    )
    jwt_expires_minutes: int = 60 * 24 * 7  # 7 days
    clerk_jwks_url: str | None = None
    # Email domains treated as "personal" — each such user gets their own
    # single-seat workspace instead of being auto-joined to a shared org.
    personal_email_domains: List[str] = Field(
        default_factory=lambda: [
            "gmail.com",
            "googlemail.com",
            "yahoo.com",
            "outlook.com",
            "hotmail.com",
            "live.com",
            "icloud.com",
            "me.com",
            "aol.com",
            "proton.me",
            "protonmail.com",
        ]
    )

    # ── Storage ────────────────────────────────────────────────────────
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 50

    # ── AI / Embeddings ────────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    llm_model: str = "llama3.1:8b"
    embedding_dim: int = 768

    # ── RAG ────────────────────────────────────────────────────────────
    chunk_size: int = 800
    chunk_overlap: int = 120
    rag_top_k: int = 5


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


settings = get_settings()
