"""End-to-end smoke test for the auth + registration flow.

Exercises the following against a *running* API server:

    POST /api/v1/auth/register  (first call — expect 201)
    POST /api/v1/auth/register  (duplicate email — expect 409)
    POST /api/v1/auth/login     (correct password — expect 200)
    POST /api/v1/auth/login     (wrong password  — expect 401)
    GET  /api/v1/users/me       (with token — expect 200 + same row)
    GET  /api/v1/users/me       (no token   — expect 401/403)

Also asserts the domain-based org auto-assignment: two accounts on the
same corporate domain (`alice@acme-test.example`, `bob@acme-test.example`)
land in the same organization, with the first as ADMIN and the second as
MEMBER.

Usage (from the `backend/` directory, venv active, API on :8000):

    python -m scripts.test_register
    python -m scripts.test_register --base-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import secrets
import sys
from dataclasses import dataclass, field

import httpx


@dataclass
class Config:
    base_url: str
    domain: str
    password: str = "correct horse battery staple"
    unique_suffix: str = field(
        default_factory=lambda: secrets.token_hex(4)
    )


class TestFailure(Exception):
    """Raised when an assertion about a response fails."""


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise TestFailure(message)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _check_health(client: httpx.Client) -> None:
    r = client.get("/health")
    _expect(r.status_code == 200, f"/health returned {r.status_code}: {r.text}")
    body = r.json()
    _expect(body.get("status") == "ok", f"/health not ok: {body!r}")
    print(f"  health: {body}")


def _register(
    client: httpx.Client, email: str, password: str, name: str | None = None
) -> httpx.Response:
    payload: dict[str, str] = {"email": email, "password": password}
    if name:
        payload["name"] = name
    return client.post("/api/v1/auth/register", json=payload)


def _login(client: httpx.Client, email: str, password: str) -> httpx.Response:
    return client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )


def _check_first_registration(client: httpx.Client, cfg: Config) -> dict:
    email = f"alice-{cfg.unique_suffix}@{cfg.domain}"
    r = _register(client, email, cfg.password, name="Alice Admin")
    _expect(
        r.status_code == 201,
        f"register expected 201, got {r.status_code}: {r.text}",
    )
    body = r.json()
    for key in ("access_token", "token_type", "user"):
        _expect(key in body, f"register response missing '{key}': {body!r}")
    user = body["user"]
    _expect(
        user["email"] == email.lower(),
        f"register normalised email mismatch: {user['email']!r} vs {email.lower()!r}",
    )
    _expect(
        user["role"] == "ADMIN",
        f"first user for a new domain should be ADMIN, got {user['role']!r}",
    )
    print(
        f"  register alice status=201 role={user['role']} "
        f"org={user['organization_id']}"
    )
    return body


def _check_duplicate_registration(
    client: httpx.Client, cfg: Config, first_user_email: str
) -> None:
    r = _register(client, first_user_email, cfg.password)
    _expect(
        r.status_code == 409,
        f"duplicate register expected 409, got {r.status_code}: {r.text}",
    )
    print(f"  register alice again status={r.status_code} (rejected OK)")


def _check_second_user_joins_org(
    client: httpx.Client, cfg: Config, first: dict
) -> dict:
    email = f"bob-{cfg.unique_suffix}@{cfg.domain}"
    r = _register(client, email, cfg.password, name="Bob Member")
    _expect(
        r.status_code == 201,
        f"second register expected 201, got {r.status_code}: {r.text}",
    )
    body = r.json()
    user = body["user"]
    _expect(
        user["organization_id"] == first["user"]["organization_id"],
        (
            "Bob should have joined Alice's organization "
            f"(got {user['organization_id']}, expected {first['user']['organization_id']})"
        ),
    )
    _expect(
        user["role"] == "MEMBER",
        f"second user for an existing domain should be MEMBER, got {user['role']!r}",
    )
    print(
        f"  register bob   status=201 role={user['role']} "
        f"org={user['organization_id']} (same as alice OK)"
    )
    return body


def _check_wrong_password_login(client: httpx.Client, email: str) -> None:
    r = _login(client, email, "definitely-not-the-right-one")
    _expect(
        r.status_code == 401,
        f"wrong-password login expected 401, got {r.status_code}: {r.text}",
    )
    print(f"  login wrong-pw status={r.status_code} (rejected OK)")


def _check_login(client: httpx.Client, cfg: Config, first: dict) -> str:
    email = first["user"]["email"]
    r = _login(client, email, cfg.password)
    _expect(
        r.status_code == 200,
        f"login expected 200, got {r.status_code}: {r.text}",
    )
    body = r.json()
    _expect(body["user"]["id"] == first["user"]["id"], "login returned a different user id")
    _expect(isinstance(body["access_token"], str) and body["access_token"],
            "login returned no access_token")
    print(f"  login alice    status=200 token=<len {len(body['access_token'])}>")
    return body["access_token"]


def _check_me(client: httpx.Client, token: str, first: dict) -> None:
    r = client.get("/api/v1/users/me", headers=_auth_headers(token))
    _expect(r.status_code == 200, f"/me expected 200, got {r.status_code}: {r.text}")
    body = r.json()
    _expect(
        body["id"] == first["user"]["id"],
        f"/me id mismatch: {body['id']} vs {first['user']['id']}",
    )
    _expect(
        body["email"] == first["user"]["email"],
        f"/me email mismatch: {body['email']} vs {first['user']['email']}",
    )
    print(f"  /me status=200 email={body['email']} role={body['role']}")


def _check_unauthenticated(client: httpx.Client) -> None:
    r = client.get("/api/v1/users/me")
    _expect(
        r.status_code in (401, 403),
        f"unauthenticated /me expected 401/403, got {r.status_code}: {r.text}",
    )
    print(f"  /me (no token) status={r.status_code} (rejected OK)")


def _parse_args() -> Config:
    parser = argparse.ArgumentParser(
        description="Smoke test for the auth + registration flow.",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the running API (default: %(default)s).",
    )
    parser.add_argument(
        "--domain",
        default="acme-test.example",
        help=(
            "Corporate email domain to use for the two test accounts "
            "(default: %(default)s). Use a domain that is guaranteed not to "
            "collide with real users."
        ),
    )
    args = parser.parse_args()
    return Config(
        base_url=args.base_url.rstrip("/"),
        domain=args.domain,
    )


def main() -> int:
    cfg = _parse_args()
    print(f"[test_register] target:   {cfg.base_url}")
    print(f"[test_register] domain:   {cfg.domain}")
    print(f"[test_register] suffix:   {cfg.unique_suffix}")

    try:
        with httpx.Client(base_url=cfg.base_url, timeout=10.0) as client:
            print("[test_register] 1/7 health probe")
            _check_health(client)

            print("[test_register] 2/7 POST /auth/register (alice — new domain)")
            first = _check_first_registration(client, cfg)

            print("[test_register] 3/7 POST /auth/register (alice again — dupe)")
            _check_duplicate_registration(
                client, cfg, first_user_email=first["user"]["email"]
            )

            print("[test_register] 4/7 POST /auth/register (bob — same domain)")
            _check_second_user_joins_org(client, cfg, first)

            print("[test_register] 5/7 POST /auth/login (wrong password)")
            _check_wrong_password_login(client, first["user"]["email"])

            print("[test_register] 6/7 POST /auth/login (correct password)")
            token = _check_login(client, cfg, first)

            print("[test_register] 7/7 GET  /users/me (+ unauthenticated check)")
            _check_me(client, token, first)
            _check_unauthenticated(client)

    except TestFailure as exc:
        print(f"[test_register] FAIL: {exc}", file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"[test_register] transport error: {exc}", file=sys.stderr)
        return 2

    print("[test_register] OK — all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
