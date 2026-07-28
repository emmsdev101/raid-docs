"""Master API router.

Aggregates every versioned sub-router so `main.py` only needs to include one.
"""

from fastapi import APIRouter

from app.api.v1 import audits, auth, chat, documents, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(audits.router, prefix="/audits", tags=["audits"])
