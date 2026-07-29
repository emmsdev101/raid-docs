"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "./components/PageHeader";
import { StatCard } from "./components/StatCard";
import { Card, CardHeader } from "./components/Card";
import {
  StatusBadge,
  SeverityBadge,
  FrameworkBadge,
} from "./components/Badges";
import { useAuth } from "./lib/auth-context";
import {
  api,
  ApiError,
  type ApiAudit,
  type ApiDocument,
  type RiskSeverity,
} from "./lib/api";
import { formatBytes, relativeTime, severityRank } from "./lib/format";

type Loadable<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export default function DashboardPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Loadable<ApiDocument[]>>({
    status: "loading",
  });
  const [audits, setAudits] = useState<Loadable<ApiAudit[]>>({
    status: "loading",
  });

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    api
      .listDocuments(token, controller.signal)
      .then((data) => setDocuments({ status: "ready", data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setDocuments({
          status: "error",
          message: err instanceof ApiError ? err.message : "Failed to load documents",
        });
      });

    api
      .listAudits(token, controller.signal)
      .then((data) => setAudits({ status: "ready", data }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setAudits({
          status: "error",
          message: err instanceof ApiError ? err.message : "Failed to load audits",
        });
      });

    return () => controller.abort();
  }, [token]);

  const docs = documents.status === "ready" ? documents.data : [];
  const auds = audits.status === "ready" ? audits.data : [];

  const totalDocuments = docs.length;
  const totalChunks = docs.reduce((acc, d) => acc + d.chunk_count, 0);
  const readyDocs = docs.filter((d) => d.status === "READY").length;
  const totalFindings = auds.reduce((acc, a) => acc + a.findings.length, 0);
  const criticalFindings = auds.reduce(
    (acc, a) => acc + a.findings.filter((f) => f.severity === "CRITICAL").length,
    0,
  );

  const recentDocuments = [...docs]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  const recentAudits = [...auds]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 4);

  const severityCounts = auds
    .flatMap((a) => a.findings)
    .reduce(
      (acc, f) => {
        acc[f.severity] += 1;
        return acc;
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<RiskSeverity, number>,
    );

  const isLoading =
    documents.status === "loading" || audits.status === "loading";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A live view of your knowledge base health, ingestion pipeline, and compliance posture."
        actions={
          <>
            <Link
              href="/ask"
              className="h-9 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z"
                  fill="currentColor"
                />
              </svg>
              Ask a question
            </Link>
            <Link
              href="/documents"
              className="h-9 inline-flex items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Upload document
            </Link>
          </>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Documents indexed"
            value={totalDocuments}
            tone="primary"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <StatCard
            label="Vector chunks"
            value={totalChunks.toLocaleString()}
            tone="neutral"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
          <StatCard
            label="Ready for search"
            value={
              totalDocuments === 0 ? "—" : `${readyDocs} / ${totalDocuments}`
            }
            tone="success"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
          <StatCard
            label="Critical findings"
            value={criticalFindings}
            tone="danger"
            delta={
              criticalFindings > 0
                ? { value: "requires action", positive: false }
                : undefined
            }
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent documents */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Recent documents"
              description="Latest uploads and their ingestion status."
              action={
                <Link
                  href="/documents"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              }
            />
            {isLoading ? (
              <div className="px-5 py-8 text-center text-xs text-muted">
                Loading…
              </div>
            ) : recentDocuments.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted">No documents yet.</p>
                <Link
                  href="/documents"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Upload your first document →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentDocuments.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/documents/${doc.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-5 w-5"
                        >
                          <path
                            d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {doc.title}
                        </div>
                        <div className="mt-0.5 text-xs text-muted flex items-center gap-2">
                          <span>{formatBytes(doc.file_size)}</span>
                          <span>·</span>
                          <span>{relativeTime(doc.created_at)}</span>
                        </div>
                      </div>
                      <StatusBadge status={doc.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Severity breakdown */}
          <Card>
            <CardHeader
              title="Findings by severity"
              description={
                auds.length === 0
                  ? "No audits yet."
                  : `${totalFindings} total across ${auds.length} audit${auds.length === 1 ? "" : "s"}.`
              }
            />
            <div className="px-5 py-5 space-y-4">
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
                const count = severityCounts[sev];
                const pct = totalFindings
                  ? Math.round((count / totalFindings) * 100)
                  : 0;
                const barColor = {
                  CRITICAL: "bg-severity-critical",
                  HIGH: "bg-severity-high",
                  MEDIUM: "bg-severity-medium",
                  LOW: "bg-severity-low",
                }[sev];
                return (
                  <div key={sev}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <SeverityBadge severity={sev} size="sm" />
                      <span className="tabular-nums text-muted">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Recent audits */}
        <Card>
          <CardHeader
            title="Recent compliance audits"
            description="Automated findings across regulatory frameworks."
            action={
              <Link
                href="/audits"
                className="text-xs font-medium text-primary hover:underline"
              >
                View all →
              </Link>
            }
          />
          {isLoading ? (
            <div className="px-5 py-8 text-center text-xs text-muted">
              Loading…
            </div>
          ) : recentAudits.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No audits have been run yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              {recentAudits.slice(0, 2).map((audit) => {
                const worst = [...audit.findings].sort(
                  (a, b) =>
                    severityRank(b.severity) - severityRank(a.severity),
                )[0];
                return (
                  <Link
                    key={audit.id}
                    href={`/audits/${audit.id}`}
                    className="p-5 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FrameworkBadge framework={audit.framework} />
                        <StatusBadge status={audit.status} />
                      </div>
                      <span className="text-xs text-muted">
                        {relativeTime(audit.created_at)}
                      </span>
                    </div>
                    <div className="mt-3 text-sm font-medium">
                      {audit.document_title ?? "Untitled document"}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <div className="text-muted">
                        {audit.status === "PENDING" ||
                        audit.status === "PROCESSING"
                          ? "Analysis in progress…"
                          : audit.status === "FAILED"
                            ? "Failed"
                            : `${audit.findings.length} finding${
                                audit.findings.length === 1 ? "" : "s"
                              }`}
                      </div>
                    </div>
                    {worst && audit.status === "READY" && (
                      <div className="mt-3 rounded-lg border border-border bg-bg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={worst.severity} size="sm" />
                          <span className="text-[11px] font-medium truncate">
                            {worst.clause}
                          </span>
                        </div>
                        <p className="text-xs text-muted line-clamp-2">
                          {worst.issue_description}
                        </p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* Pipeline status */}
        <Card>
          <CardHeader
            title="Ingestion pipeline"
            description="Live status of the async worker queue."
          />
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {[
              {
                label: "In queue",
                value: docs.filter((d) => d.status === "PENDING").length,
                caption: "waiting for worker",
              },
              {
                label: "Processing",
                value: docs.filter((d) => d.status === "PROCESSING").length,
                caption: "chunking + embedding",
              },
              {
                label: "Ready",
                value: readyDocs,
                caption: "searchable",
              },
              {
                label: "Failed",
                value: docs.filter((d) => d.status === "FAILED").length,
                caption: "needs retry",
              },
            ].map((s) => (
              <div key={s.label} className="px-5 py-4">
                <div className="text-xs text-muted">{s.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-2">
                  {s.caption}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
