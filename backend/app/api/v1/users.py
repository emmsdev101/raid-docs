"""User + organization lookup endpoints.

Account creation lives in `app.api.v1.auth` — this module only exposes
read-only lookups scoped to the caller's organization.
"""

from __future__ import annotations

from typing import List

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_connection
from app.core.security import CurrentUser, get_current_user
from app.schemas.user import OrganizationOut, UserOut, UserRole

router = APIRouter()


def _row_to_user(row: asyncpg.Record) -> UserOut:
    return UserOut(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        role=UserRole(row["role"]),
        organization_id=row["organizationId"],
        created_at=row["createdAt"],
    )


@router.get("/me", response_model=UserOut)
async def get_me(
    conn: asyncpg.Connection = Depends(get_connection),
    current: CurrentUser = Depends(get_current_user),
) -> UserOut:
    """Return the current user's profile row (404 if not yet registered)."""
    row = await conn.fetchrow(
        """
        SELECT "id", "email", "name", "role", "organizationId", "createdAt"
        FROM "User"
        WHERE "id" = $1
        """,
        current.id,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not registered")
    return _row_to_user(row)


@router.get("", response_model=List[UserOut])
async def list_org_members(
    conn: asyncpg.Connection = Depends(get_connection),
    current: CurrentUser = Depends(get_current_user),
) -> List[UserOut]:
    """List all users in the caller's organization."""
    rows = await conn.fetch(
        """
        SELECT "id", "email", "name", "role", "organizationId", "createdAt"
        FROM "User"
        WHERE "organizationId" = $1
        ORDER BY "createdAt" ASC
        """,
        current.organization_id,
    )
    return [_row_to_user(r) for r in rows]


@router.get("/organization", response_model=OrganizationOut)
async def get_organization(
    conn: asyncpg.Connection = Depends(get_connection),
    current: CurrentUser = Depends(get_current_user),
) -> OrganizationOut:
    """Return the caller's organization (+ member count)."""
    row = await conn.fetchrow(
        """
        SELECT o."id", o."name", o."domain", o."createdAt",
               COALESCE(m."memberCount", 0) AS "memberCount"
        FROM "Organization" o
        LEFT JOIN (
            SELECT "organizationId", COUNT(*)::int AS "memberCount"
            FROM "User"
            GROUP BY "organizationId"
        ) m ON m."organizationId" = o."id"
        WHERE o."id" = $1
        """,
        current.organization_id,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return OrganizationOut(
        id=row["id"],
        name=row["name"],
        domain=row["domain"],
        created_at=row["createdAt"],
        member_count=row["memberCount"],
    )
