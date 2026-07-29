"""LLM compliance auditor: map document text against a regulatory framework.

Produces structured `AuditFinding` rows (severity, clause, issue, remediation)
via Ollama JSON generation. Used by the async audit pipeline task.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence

import asyncpg
import httpx

from app.config import settings
from app.schemas.audit import RiskSeverity

log = logging.getLogger(__name__)

# Keep local LLM context workable (llama3.1:8b and similar).
_MAX_DOCUMENT_CHARS = 50_000

_VALID_SEVERITIES = {s.value for s in RiskSeverity}

_FRAMEWORK_ALIASES: Dict[str, str] = {
    "gdpr": "GDPR",
    "soc2": "SOC2",
    "soc 2": "SOC2",
    "soc-2": "SOC2",
    "hipaa": "HIPAA",
}

_FRAMEWORK_GUIDANCE: Dict[str, str] = {
    "GDPR": (
        "Evaluate against GDPR themes: lawful basis & consent, data subject rights "
        "(access, erasure, portability), purpose limitation, data minimization, "
        "retention limits, international transfers, processor/controller duties, "
        "security of processing (Art. 32), breach notification, DPIA triggers, "
        "and privacy by design."
    ),
    "SOC2": (
        "Evaluate against SOC 2 Trust Services Criteria themes: security "
        "(access control, encryption, change management), availability, "
        "processing integrity, confidentiality, and privacy. Flag gaps in "
        "policies, logging/monitoring, vendor management, and incident response."
    ),
    "HIPAA": (
        "Evaluate against HIPAA themes: Privacy Rule (uses/disclosures, minimum "
        "necessary, patient rights), Security Rule (admin/physical/technical "
        "safeguards), Breach Notification, Business Associate agreements, and "
        "PHI handling in the document text."
    ),
}

_GENERIC_GUIDANCE = (
    "Evaluate the document for compliance gaps against the named framework. "
    "Focus on concrete policy/control language that is missing, weak, "
    "contradictory, or non-compliant."
)

_SYSTEM_PROMPT = """You are RAID Docs, an enterprise compliance auditor.

TASK:
Analyze the document text against the specified regulatory framework and produce
a prioritized list of compliance findings.

RULES:
1. Base findings ONLY on the document text. Do not invent clauses that are not present.
2. Each finding must cite a specific clause, section title, or quoted policy fragment from the document.
3. If the document appears compliant or the text is insufficient to identify issues, return an empty findings array.
4. Severity must be one of: LOW, MEDIUM, HIGH, CRITICAL.
5. Respond with JSON only — no markdown fences, no commentary.

OUTPUT SCHEMA (strict):
{{
  "findings": [
    {{
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "clause": "short label or quoted fragment from the document",
      "issue_description": "what is wrong and why it matters under the framework",
      "remediation": "concrete recommended fix"
    }}
  ]
}}

FRAMEWORK: {framework}
GUIDANCE: {guidance}
"""


def normalize_framework(raw: str) -> str:
    """Trim and canonicalize common framework aliases."""
    cleaned = " ".join(raw.strip().split())
    if not cleaned:
        return cleaned
    alias = _FRAMEWORK_ALIASES.get(cleaned.lower())
    if alias:
        return alias
    # Preserve known uppercase forms; otherwise title-case lightly.
    upper = cleaned.upper()
    if upper in _FRAMEWORK_GUIDANCE:
        return upper
    return cleaned


@dataclass(frozen=True)
class ParsedFinding:
    severity: RiskSeverity
    clause: str
    issue_description: str
    remediation: str


async def run_audit(
    conn: asyncpg.Connection,
    *,
    audit_id: uuid.UUID,
) -> int:
    """Load document chunks, call the LLM, and persist findings.

    Returns the number of findings written. Raises on hard failures so the
    caller can mark the audit FAILED.
    """
    audit = await conn.fetchrow(
        """
        SELECT a."id", a."documentId", a."organizationId", a."framework",
               d."status" AS "documentStatus", d."title" AS "documentTitle"
        FROM "ComplianceAudit" a
        JOIN "Document" d ON d."id" = a."documentId"
        WHERE a."id" = $1
        """,
        audit_id,
    )
    if audit is None:
        raise ValueError(f"Audit {audit_id} not found")

    if audit["documentStatus"] != "READY":
        raise ValueError(
            f"Document is not READY (status={audit['documentStatus']})"
        )

    chunks = await conn.fetch(
        """
        SELECT c."content"
        FROM "DocumentChunk" c
        JOIN "Document" d ON d."id" = c."documentId"
        WHERE c."documentId" = $1
          AND d."organizationId" = $2
        ORDER BY c."chunkIndex" ASC
        """,
        audit["documentId"],
        audit["organizationId"],
    )

    document_text, truncated = _assemble_document_text(
        [r["content"] for r in chunks]
    )
    if not document_text.strip():
        # Nothing to analyze — treat as a successful empty audit.
        await _finalize_ready(conn, audit_id, findings=[])
        return 0

    framework = normalize_framework(audit["framework"])
    guidance = _FRAMEWORK_GUIDANCE.get(framework, _GENERIC_GUIDANCE)
    prompt = _build_prompt(
        framework=framework,
        guidance=guidance,
        document_title=audit["documentTitle"] or "Untitled",
        document_text=document_text,
        truncated=truncated,
    )

    raw = await _generate_json(prompt)
    findings = _parse_findings(raw)
    await _finalize_ready(conn, audit_id, findings=findings)
    return len(findings)


def _assemble_document_text(chunks: Sequence[str]) -> tuple[str, bool]:
    parts: List[str] = []
    total = 0
    truncated = False
    for chunk in chunks:
        text = (chunk or "").strip()
        if not text:
            continue
        if total + len(text) + 2 > _MAX_DOCUMENT_CHARS:
            remaining = _MAX_DOCUMENT_CHARS - total - 2
            if remaining > 200:
                parts.append(text[:remaining])
                total += remaining
            truncated = True
            break
        parts.append(text)
        total += len(text) + 2
    return "\n\n".join(parts), truncated


def _build_prompt(
    *,
    framework: str,
    guidance: str,
    document_title: str,
    document_text: str,
    truncated: bool,
) -> str:
    system = _SYSTEM_PROMPT.format(framework=framework, guidance=guidance)
    truncation_note = (
        "\n\nNOTE: Document text was truncated to fit the model context. "
        "Only audit the provided portion."
        if truncated
        else ""
    )
    return (
        f"{system}\n\n"
        f"Document title: {document_title}\n\n"
        f"Document text:{truncation_note}\n"
        f"{document_text}\n\n"
        "JSON response:"
    )


async def _generate_json(prompt: str) -> str:
    url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                url,
                json={
                    "model": settings.llm_model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            response.raise_for_status()
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Could not connect to Ollama at {settings.ollama_base_url}. "
                f"Is it running (`ollama serve`)?"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                f"Ollama generate failed: {exc.response.status_code} "
                f"{exc.response.text[:300]}"
            ) from exc

    return response.json().get("response", "").strip()


def _parse_findings(raw: str) -> List[ParsedFinding]:
    payload = _load_json_payload(raw)
    if payload is None:
        log.warning("Auditor returned non-JSON response; treating as no findings")
        return []

    items: Any
    if isinstance(payload, dict):
        items = payload.get("findings", [])
    elif isinstance(payload, list):
        items = payload
    else:
        return []

    if not isinstance(items, list):
        return []

    findings: List[ParsedFinding] = []
    for item in items:
        parsed = _normalize_finding(item)
        if parsed is not None:
            findings.append(parsed)
    return findings


def _load_json_payload(raw: str) -> Any | None:
    text = raw.strip()
    if not text:
        return None
    # Strip accidental markdown fences if the model ignores format=json.
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Best-effort: extract first JSON object/array substring.
        for opener, closer in (("{", "}"), ("[", "]")):
            start = text.find(opener)
            end = text.rfind(closer)
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    continue
        return None


def _normalize_finding(item: Any) -> ParsedFinding | None:
    if not isinstance(item, dict):
        return None

    severity_raw = str(
        item.get("severity")
        or item.get("Severity")
        or ""
    ).strip().upper()
    if severity_raw not in _VALID_SEVERITIES:
        return None

    clause = str(item.get("clause") or item.get("Clause") or "").strip()
    issue = str(
        item.get("issue_description")
        or item.get("issueDescription")
        or item.get("issue")
        or ""
    ).strip()
    remediation = str(
        item.get("remediation") or item.get("Remediation") or ""
    ).strip()

    if not clause or not issue or not remediation:
        return None

    return ParsedFinding(
        severity=RiskSeverity(severity_raw),
        clause=clause[:500],
        issue_description=issue,
        remediation=remediation,
    )


async def _finalize_ready(
    conn: asyncpg.Connection,
    audit_id: uuid.UUID,
    *,
    findings: Sequence[ParsedFinding],
) -> None:
    async with conn.transaction():
        await conn.execute(
            'DELETE FROM "AuditFinding" WHERE "auditId" = $1',
            audit_id,
        )
        if findings:
            await conn.executemany(
                """
                INSERT INTO "AuditFinding" (
                    "id", "auditId", "severity",
                    "clause", "issueDescription", "remediation"
                )
                VALUES ($1, $2, $3::"RiskSeverity", $4, $5, $6)
                """,
                [
                    (
                        uuid.uuid4(),
                        audit_id,
                        f.severity.value,
                        f.clause,
                        f.issue_description,
                        f.remediation,
                    )
                    for f in findings
                ],
            )
        await conn.execute(
            """
            UPDATE "ComplianceAudit"
            SET "status" = 'READY'::"AuditStatus",
                "errorMessage" = NULL
            WHERE "id" = $1
            """,
            audit_id,
        )
