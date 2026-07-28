"""Tiny SQL migration runner (no Alembic, no ORM).

Applies numbered `.sql` files from `backend/migrations/` in filename order
and records what's been applied in a `_schema_migrations` table.

Usage (from the `backend/` directory, with your venv activated):

    python -m scripts.migrate            # apply all pending migrations
    python -m scripts.migrate --status   # show which files are applied

Design notes:
    - Each file is applied inside a single transaction.
    - A SHA-256 of the file contents is stored so we can detect files that
      were edited after being applied (which is almost always a bug — write
      a new migration instead of mutating an old one).
    - Files must be named like `NNN_name.sql` so lexicographic sort == apply
      order (e.g. `001_initial.sql`, `002_add_teams.sql`, ...).
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import sys
from pathlib import Path

import asyncpg

from app.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

CREATE_MIGRATIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS _schema_migrations (
    filename    TEXT        PRIMARY KEY,
    checksum    TEXT        NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _discover_migrations() -> list[Path]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    return sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.is_file())


async def _apply_all(conn: asyncpg.Connection) -> int:
    await conn.execute(CREATE_MIGRATIONS_TABLE_SQL)

    rows = await conn.fetch(
        "SELECT filename, checksum FROM _schema_migrations"
    )
    applied: dict[str, str] = {r["filename"]: r["checksum"] for r in rows}

    files = _discover_migrations()
    if not files:
        print("[migrate] no migration files found")
        return 0

    pending = 0
    for path in files:
        sql = path.read_text(encoding="utf-8")
        digest = _sha256(sql)
        name = path.name

        if name in applied:
            if applied[name] != digest:
                print(
                    f"[migrate] WARNING: {name} has been modified since it was "
                    f"applied (checksum mismatch). Write a new migration "
                    f"instead of editing this one.",
                    file=sys.stderr,
                )
            else:
                print(f"[migrate] skip   {name}")
            continue

        print(f"[migrate] apply  {name} ...")
        async with conn.transaction():
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO _schema_migrations (filename, checksum) "
                "VALUES ($1, $2)",
                name,
                digest,
            )
        print(f"[migrate] done   {name}")
        pending += 1

    if pending == 0:
        print("[migrate] database is up to date")
    else:
        print(f"[migrate] applied {pending} migration(s)")
    return pending


async def _baseline(conn: asyncpg.Connection) -> int:
    """Mark all pending migrations as applied without running their SQL.

    Use this exactly once, when adopting the migration runner against a
    database that already has the target schema (e.g. it was created by
    running raw SQL before this tool existed).
    """
    await conn.execute(CREATE_MIGRATIONS_TABLE_SQL)

    applied = {
        r["filename"]
        for r in await conn.fetch("SELECT filename FROM _schema_migrations")
    }
    files = _discover_migrations()
    if not files:
        print("[migrate] no migration files found")
        return 0

    marked = 0
    for path in files:
        if path.name in applied:
            print(f"[migrate] skip     {path.name} (already recorded)")
            continue
        digest = _sha256(path.read_text(encoding="utf-8"))
        await conn.execute(
            "INSERT INTO _schema_migrations (filename, checksum) "
            "VALUES ($1, $2)",
            path.name,
            digest,
        )
        print(f"[migrate] baseline {path.name}")
        marked += 1

    if marked == 0:
        print("[migrate] nothing to baseline")
    else:
        print(f"[migrate] baselined {marked} migration(s)")
    return marked


async def _status(conn: asyncpg.Connection) -> None:
    await conn.execute(CREATE_MIGRATIONS_TABLE_SQL)
    applied = {
        r["filename"]
        for r in await conn.fetch("SELECT filename FROM _schema_migrations")
    }
    files = _discover_migrations()
    if not files:
        print("(no migration files found)")
        return
    for path in files:
        marker = "x" if path.name in applied else " "
        print(f"[{marker}] {path.name}")


async def _run() -> int:
    parser = argparse.ArgumentParser(
        description="Apply raid-docs SQL migrations."
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show which migrations are applied without changing anything.",
    )
    parser.add_argument(
        "--baseline",
        action="store_true",
        help=(
            "Mark all pending migrations as applied WITHOUT running their SQL. "
            "Use once when adopting this runner against a DB that already "
            "matches the schema."
        ),
    )
    args = parser.parse_args()

    conn = await asyncpg.connect(dsn=str(settings.database_url))
    try:
        if args.status:
            await _status(conn)
        elif args.baseline:
            await _baseline(conn)
        else:
            await _apply_all(conn)
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
