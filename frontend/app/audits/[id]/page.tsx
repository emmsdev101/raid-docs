"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../../components/PageHeader";
import { FrameworkBadge, SeverityBadge } from "../../components/Badges";
import { Card, CardHeader } from "../../components/Card";
import { FindingRow } from "../../components/FindingRow";
import { useAuth } from "../../lib/auth-context";
import {
  api,
  ApiError,
  type ApiAudit,
  type RiskSeverity,
} from "../../lib/api";
import { formatDateTime, severityRank } from "../../lib/format";

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const id = params?.id;

  const [audit, setAudit] = useState<ApiAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    const controller = new AbortController();
    api
      .getAudit(token, id, controller.signal)
      .then((row) => {
        if (controller.signal.aborted) return;
        setAudit(row);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("This audit does not exist or is not in your organization.");
        } else {
          setError(err instanceof ApiError ? err.message : "Failed to load audit");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, id]);

  const findings = useMemo(
    () =>
      audit
        ? [...audit.findings].sort(
            (a, b) => severityRank(b.severity) - severityRank(a.severity),
          )
        : [],
    [audit],
  );

  const counts = useMemo(
    () =>
      (audit?.findings ?? []).reduce(
        (acc, f) => {
          acc[f.severity] += 1;
          return acc;
        },
        { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<
          RiskSeverity,
          number
        >,
      ),
    [audit],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-4 w-4 rounded-full border-2 border-border border-t-primary animate-spin" />
          Loading audit…
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="max-w-lg mx-auto mt-16 px-6 text-center">
        <h1 className="text-lg font-semibold">Audit not found</h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "This audit does not exist."}
        </p>
        <button
          onClick={() => router.push("/audits")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 h-9 text-xs font-medium hover:bg-surface-2 transition-colors"
        >
          Back to audits
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${audit.framework} audit`}
        breadcrumb={[
          { label: "Audits", href: "/audits" },
          { label: audit.framework },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary */}
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
            <div>
              <div className="text-[11px] text-muted uppercase tracking-wider mb-2">
                Framework
              </div>
              <FrameworkBadge framework={audit.framework} />
              <div className="mt-4 text-[11px] text-muted uppercase tracking-wider">
                Run at
              </div>
              <div className="mt-1 text-sm font-medium">
                {formatDateTime(audit.created_at)}
              </div>
            </div>

            <div className="md:border-l md:border-r border-border md:px-6">
              <div className="text-[11px] text-muted uppercase tracking-wider mb-2">
                Audited document
              </div>
              <Link
                href={`/documents/${audit.document_id}`}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {audit.document_title ?? "Untitled document"}
              </Link>
              <div className="mt-3 text-[11px] text-muted">
                {audit.findings.length} finding
                {audit.findings.length === 1 ? "" : "s"} recorded
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted uppercase tracking-wider mb-2">
                Findings breakdown
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
                  <div
                    key={sev}
                    className="rounded-lg border border-border bg-bg px-3 py-2 flex items-center justify-between"
                  >
                    <SeverityBadge severity={sev} size="sm" />
                    <span className="text-sm font-semibold tabular-nums">
                      {counts[sev]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Findings */}
        <Card>
          <CardHeader
            title={`Findings (${findings.length})`}
            description="Sorted by severity. Expand each finding to review evidence and recommended remediation."
          />
          {findings.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              This audit produced no findings.
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {findings.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
