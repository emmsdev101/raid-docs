"""Pydantic schemas for compliance-audit endpoints."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class RiskSeverity(str, enum.Enum):
    """Matches the Postgres `RiskSeverity` enum."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AuditStatus(str, enum.Enum):
    """Matches the Postgres `AuditStatus` enum."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class AuditCreate(BaseModel):
    document_id: uuid.UUID
    framework: str = Field(..., min_length=1, max_length=64)


class AuditFindingOut(BaseModel):
    id: uuid.UUID
    severity: RiskSeverity
    clause: str
    issue_description: str
    remediation: str


class AuditOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    document_title: str | None = None
    organization_id: uuid.UUID
    framework: str
    status: AuditStatus
    error_message: str | None = None
    created_at: datetime
    findings: List[AuditFindingOut] = Field(default_factory=list)


class AuditStatusOut(BaseModel):
    id: uuid.UUID
    status: AuditStatus
    error_message: str | None = None
