"""Celery application factory backed by Redis."""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "raid_docs",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.ingestion", "app.tasks.sweep", "app.tasks.audit"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=60 * 30,     # 30 minute hard limit
    task_soft_time_limit=60 * 25,
    worker_max_tasks_per_child=100,
    beat_schedule={
        "sweep-stuck-documents": {
            "task": "tasks.sweep.sweep_stuck_documents",
            "schedule": float(settings.ingestion_sweep_interval_seconds),
        },
    },
)
