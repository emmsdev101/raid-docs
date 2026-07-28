"""Email + password authentication endpoints.

Flow:

    POST /auth/register  -> creates the User row (and Organization when the
                            email's domain hasn't been seen before). Returns
                            a signed JWT + the user profile.
    POST /auth/login     -> verifies the password and returns a fresh JWT.

Organization assignment is domain-driven: `alice@acme.com` and
`bob@acme.com` land in the same `Organization`, while `alice@gmail.com`
gets a private single-seat workspace (since gmail.com is treated as a
personal-email provider).
"""

from __future__ import annotations

import re
import uuid

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.core.database import get_connection
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.schemas.user import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UserOut,
    UserRole,
)

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────
def _row_to_user(row: asyncpg.Record) -> UserOut:
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=UserRole(row["role"]),
        organization_id=row["organizationId"],
        created_at=row["createdAt"],
    )


def _split_email(email: str) -> tuple[str, str]:
    """Return `(normalised_email, domain)` or raise 422."""
    normalised = email.strip().lower()
    if "@" not in normalised:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Malformed email address"
        )
    _, domain = normalised.rsplit("@", 1)
    if not domain:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Malformed email address"
        )
    return normalised, domain


def _is_personal_domain(domain: str) -> bool:
    return domain.lower() in {d.lower() for d in settings.personal_email_domains}


def _org_name_from_domain(domain: str) -> str:
    """Turn `acme-inc.co.uk` into `Acme-Inc`."""
    head = domain.split(".", 1)[0]
    # Drop anything that isn't a letter/number/dash — keeps it readable.
    cleaned = re.sub(r"[^A-Za-z0-9-]", "", head) or head or "Workspace"
    return cleaned[:1].upper() + cleaned[1:]


async def _resolve_organization(
    conn: asyncpg.Connection,
    *,
    email: str,
    domain: str,
) -> tuple[uuid.UUID, bool]:
    """Return `(organization_id, is_first_member)`.

    - Corporate domains: shared org keyed by lowercase domain. The first
      person for that domain becomes ADMIN, everyone else joins as MEMBER.
    - Personal domains (gmail, ...): each user gets their own private org
      so unrelated gmail signups don't end up in a shared workspace.
    """
    if _is_personal_domain(domain):
        org_row = await conn.fetchrow(
            """
            INSERT INTO "Organization" ("name", "domain")
            VALUES ($1, NULL)
            RETURNING "id"
            """,
            f"{email}'s workspace",
        )
        assert org_row is not None
        return org_row["id"], True

    existing = await conn.fetchrow(
        'SELECT "id" FROM "Organization" WHERE LOWER("domain") = $1',
        domain,
    )
    if existing is not None:
        return existing["id"], False

    org_row = await conn.fetchrow(
        """
        INSERT INTO "Organization" ("name", "domain")
        VALUES ($1, $2)
        RETURNING "id"
        """,
        _org_name_from_domain(domain),
        domain,
    )
    assert org_row is not None
    return org_row["id"], True


# ── Endpoints ──────────────────────────────────────────────────────────
@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    conn: asyncpg.Connection = Depends(get_connection),
) -> AuthResponse:
    """Create a new user, auto-assign them to the org for their email domain."""
    email, domain = _split_email(payload.email)

    existing = await conn.fetchrow(
        'SELECT "id" FROM "User" WHERE LOWER("email") = $1', email
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with this email already exists. Try signing in.",
        )

    password_hash = hash_password(payload.password)

    async with conn.transaction():
        org_id, is_first_member = await _resolve_organization(
            conn, email=email, domain=domain
        )
        role = UserRole.ADMIN if is_first_member else UserRole.MEMBER

        row = await conn.fetchrow(
            """
            INSERT INTO "User" ("email", "name", "role", "organizationId", "passwordHash")
            VALUES ($1, $2, $3::"Role", $4, $5)
            RETURNING "id", "email", "name", "role", "organizationId", "createdAt"
            """,
            email,
            payload.name,
            role.value,
            org_id,
            password_hash,
        )

    assert row is not None
    user = _row_to_user(row)
    token = create_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        email=user.email,
    )
    return AuthResponse(access_token=token, user=user)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    conn: asyncpg.Connection = Depends(get_connection),
) -> AuthResponse:
    """Verify credentials and issue an access token."""
    email, _ = _split_email(payload.email)

    row = await conn.fetchrow(
        """
        SELECT "id", "email", "name", "role", "organizationId",
               "createdAt", "passwordHash"
        FROM "User"
        WHERE LOWER("email") = $1
        """,
        email,
    )
    # Same error for "no such user" and "wrong password" so we don't leak
    # which emails are registered.
    if row is None or not verify_password(payload.password, row["passwordHash"]):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password",
        )

    user = _row_to_user(row)
    token = create_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        email=user.email,
    )
    return AuthResponse(access_token=token, user=user)
