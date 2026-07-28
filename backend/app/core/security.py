"""Authentication primitives.

Two auth modes are supported and picked at request time by
`get_current_user`:

1. **Local mode** (default) — the API owns the credentials. Passwords are
   hashed with bcrypt and access tokens are HS256 JWTs signed with
   `settings.jwt_secret_key`.

2. **External IdP mode** — set `settings.clerk_jwks_url` and incoming
   tokens are verified against that JWKS document with
   `settings.jwt_algorithm` (default RS256 in that mode).

The module also owns a small dev bypass: in `APP_ENV=development` and only
when *no* real auth is configured, an opaque `dev_<hex>` token is accepted
so scripts / smoke tests can hit protected endpoints without going through
the full login flow. Each distinct token maps to its own synthetic user so
tests aren't accidentally sharing state.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=True)


# ── Data classes ────────────────────────────────────────────────────────
@dataclass(frozen=True)
class CurrentUser:
    """Lightweight identity extracted from a verified token."""

    id: uuid.UUID
    organization_id: uuid.UUID
    email: str | None = None
    claims: dict[str, Any] | None = None


# ── Password hashing ────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Return a bcrypt hash for `password` (utf-8 encoded)."""
    if not password:
        raise ValueError("password must be non-empty")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    """Constant-time check of `password` against a stored bcrypt hash."""
    if not password or not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── Local JWT issuance ──────────────────────────────────────────────────
def create_access_token(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    email: str,
) -> str:
    """Mint an HS256 JWT for the given identity."""
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "org_id": str(organization_id),
        "email": email,
        "iss": settings.jwt_issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


# ── JWKS cache (external IdP path) ──────────────────────────────────────
_jwks_cache: dict[str, Any] = {}


async def _get_jwks() -> dict[str, Any]:
    if not settings.clerk_jwks_url:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "CLERK_JWKS_URL is not configured",
        )
    if "keys" in _jwks_cache:
        return _jwks_cache
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(settings.clerk_jwks_url)
        response.raise_for_status()
        _jwks_cache.update(response.json())
    return _jwks_cache


def _select_key(jwks: dict[str, Any], kid: str) -> dict[str, Any]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")


# ── Dev bypass helpers ──────────────────────────────────────────────────
def _dev_bypass_enabled() -> bool:
    """Only allow the bypass when nothing real is configured."""
    if settings.app_env != "development":
        return False
    if settings.clerk_jwks_url:
        return False
    # If the operator has set a strong secret we assume they *want* real
    # JWTs even in dev; the bypass would silently mask token bugs.
    default_secret = "dev-insecure-change-me-in-production-please"
    return settings.jwt_secret_key == default_secret


def _dev_uuid(namespace: str, value: str) -> uuid.UUID:
    """Deterministic UUID from an arbitrary string, for dev tokens."""
    digest = hashlib.sha256(f"{namespace}:{value}".encode("utf-8")).hexdigest()
    return uuid.UUID(digest[:32])


# ── Main dependency ─────────────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """Decode and verify the incoming bearer JWT."""
    token = credentials.credentials

    # Dev bypass: opaque `dev_<hex>` tokens are accepted only when neither
    # Clerk nor a custom JWT secret is configured. Each distinct token maps
    # to its own synthetic user so parallel dev sessions don't collide.
    if _dev_bypass_enabled() and token.startswith("dev_"):
        return CurrentUser(
            id=_dev_uuid("user", token),
            organization_id=_dev_uuid("org", token),
            email=None,
        )

    payload: dict[str, Any]
    try:
        if settings.clerk_jwks_url:
            unverified_header = jwt.get_unverified_header(token)
            jwks = await _get_jwks()
            key = _select_key(jwks, unverified_header["kid"])
            payload = jwt.decode(
                token,
                key,
                algorithms=[settings.jwt_algorithm or "RS256"],
                audience=settings.jwt_audience,
                issuer=settings.jwt_issuer,
                options={"verify_aud": settings.jwt_audience is not None},
            )
        else:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=["HS256"],
                issuer=settings.jwt_issuer,
                options={"verify_aud": False},
            )
    except (JWTError, KeyError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}"
        ) from exc

    try:
        user_id = uuid.UUID(str(payload["sub"]))
        org_id = uuid.UUID(str(payload.get("org_id") or payload["sub"]))
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Token missing required claims"
        ) from exc

    return CurrentUser(
        id=user_id,
        organization_id=org_id,
        email=payload.get("email"),
        claims=payload,
    )
