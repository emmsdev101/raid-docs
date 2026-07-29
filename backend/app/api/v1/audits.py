"""Compliance auditing endpoints."""

from __future__ import annotations

import uuid
from typing import List

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core.database import get_connection
from app.core.security import CurrentUser, get_current_user
from app.schemas.audit import (
    AuditCreate,
    AuditFindingOut,
    AuditOut,
    AuditStatus,
    AuditStatusOut,
    RiskSeverity,
)
from app.services.auditor import normalize_framework
from app.tasks.audit import enqueue_audit

router = APIRouter()


def _row_to_finding(row: asyncpg.Record) -> AuditFindingOut:
    return AuditFindingOut(
        id=row["id"],
        severity=RiskSeverity(row["severity"]),
        clause=row["clause"],
        issue_description=row["issueDescription"],
        remediation=row["remediation"],
    )


async def _fetch_findings(
    conn: asyncpg.Connection, audit_id: uuid.UUID
) -> List[AuditFindingOut]:
    rows = await conn.fetch(
        """
        SELECT "id", "severity", "clause", "issueDescription", "remediation"
        FROM "AuditFinding"
        WHERE "auditId" = $1
        ORDER BY "severity" DESC
        """,
        audit_id,
    )
    return [_row_to_finding(r) for r in rows]


def _row_to_audit(row: asyncpg.Record, findings: List[AuditFindingOut]) -> AuditOut:
    keys = row.keys()
    return AuditOut(
        id=row["id"],
        document_id=row["documentId"],
        document_title=row["documentTitle"] if "documentTitle" in keys else None,
        organization_id=row["organizationId"],
        framework=row["framework"],
        status=AuditStatus(row["status"]),
        error_message=row["errorMessage"] if "errorMessage" in keys else None,
        created_at=row["createdAt"],
        findings=findings,
    )


_AUDIT_SELECT = """
SELECT a."id", a."documentId", a."organizationId", a."framework",
       a."status", a."errorMessage", a."createdAt",
       d."title" AS "documentTitle"
FROM "ComplianceAudit" a
LEFT JOIN "Document" d ON d."id" = a."documentId"
"""


@router.post("", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
async def create_audit(
    payload: AuditCreate,
    background_tasks: BackgroundTasks,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> AuditOut:
    framework = normalize_framework(payload.framework)
    if not framework:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "framework must not be empty",
        )

    # Ensure the referenced document belongs to the caller's org and is READY.
    doc = await conn.fetchrow(
        """
        SELECT "id", "status"
        FROM "Document"
        WHERE "id" = $1 AND "organizationId" = $2
        """,
        payload.document_id,
        user.organization_id,
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    if doc["status"] != "READY":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Document must be READY before running a compliance audit",
        )

    audit_id = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO "ComplianceAudit" (
            "id", "documentId", "organizationId", "framework", "status"
        )
        VALUES ($1, $2, $3, $4, 'PENDING'::"AuditStatus")
        """,
        audit_id,
        payload.document_id,
        user.organization_id,
        framework,
    )
    row = await conn.fetchrow(_AUDIT_SELECT + 'WHERE a."id" = $1', audit_id)
    assert row is not None

    enqueue_audit(str(audit_id), background_tasks=background_tasks)
    return _row_to_audit(row, findings=[])


@router.get("", response_model=List[AuditOut])
async def list_audits(
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> List[AuditOut]:
    rows = await conn.fetch(
        _AUDIT_SELECT
        + 'WHERE a."organizationId" = $1 ORDER BY a."createdAt" DESC',
        user.organization_id,
    )
    audits: List[AuditOut] = []
    for row in rows:
        findings = await _fetch_findings(conn, row["id"])
        audits.append(_row_to_audit(row, findings))
    return audits


@router.get("/{audit_id}/status", response_model=AuditStatusOut)
async def get_audit_status(
    audit_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> AuditStatusOut:
    row = await conn.fetchrow(
        """
        SELECT "id", "status", "errorMessage"
        FROM "ComplianceAudit"
        WHERE "id" = $1 AND "organizationId" = $2
        """,
        audit_id,
        user.organization_id,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit not found")
    return AuditStatusOut(
        id=row["id"],
        status=AuditStatus(row["status"]),
        error_message=row["errorMessage"],
    )


@router.get("/{audit_id}", response_model=AuditOut)
async def get_audit(
    audit_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> AuditOut:
    row = await conn.fetchrow(
        _AUDIT_SELECT + 'WHERE a."id" = $1 AND a."organizationId" = $2',
        audit_id,
        user.organization_id,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit not found")

    findings = await _fetch_findings(conn, audit_id)
    return _row_to_audit(row, findings)
