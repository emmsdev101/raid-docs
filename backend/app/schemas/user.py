"""Pydantic schemas for user + auth endpoints."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, enum.Enum):
    
    """Matches the Postgres `Role` enum."""

    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str | None = None
    role: UserRole
    organization_id: uuid.UUID
    created_at: datetime


class RegisterRequest(BaseModel):
    """Payload for `POST /auth/register`.

    Organization is auto-derived from the email's domain — the caller does
    not choose one. If the domain is a well-known personal provider (gmail,
    outlook, ...) the user gets a private single-seat workspace instead of
    being auto-joined to a shared org.
    """

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    """Returned by `/auth/register` and `/auth/login`."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut


class OrganizationOut(BaseModel):
    id: uuid.UUID
    name: str
    domain: str | None = None
    created_at: datetime
    member_count: int = 0
