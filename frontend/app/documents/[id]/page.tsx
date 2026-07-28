"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "../../components/PageHeader";
import { Card, CardHeader } from "../../components/Card";
import {
  StatusBadge,
  FrameworkBadge,
  SeverityBadge,
} from "../../components/Badges";
import { useAuth } from "../../lib/auth-context";
import {
  api,
  ApiError,
  type ApiAudit,
  type ApiDocument,
} from "../../lib/api";
import { formatBytes, formatDateTime, severityRank } from "../../lib/format";

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const id = params?.id;

  const [doc, setDoc] = useState<ApiDocument | null>(null);
  const [audits, setAudits] = useState<ApiAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    const controller = new AbortController();
    setLoading(true);

    Promise.all([
      api.getDocument(token, id, controller.signal),
      api.listAudits(token, controller.signal),
    ])
      .then(([document, allAudits]) => {
        if (controller.signal.aborted) return;
        setDoc(document);
        setAudits(allAudits.filter((a) => a.document_id === id));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("This document does not exist or is not in your organization.");
        } else {
          setError(
            err instanceof ApiError ? err.message : "Failed to load document",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, id]);

  const relatedAudits = useMemo(() => audits, [audits]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-4 w-4 rounded-full border-2 border-border border-t-primary animate-spin" />
          Loading document…
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="max-w-lg mx-auto mt-16 px-6 text-center">
        <h1 className="text-lg font-semibold">Document not found</h1>
        <p className="mt-2 text-sm text-muted">
          {error ?? "This document does not exist."}
        </p>
        <button
          onClick={() => router.push("/documents")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 h-9 text-xs font-medium hover:bg-surface-2 transition-colors"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={doc.title}
        breadcrumb={[
          { label: "Documents", href: "/documents" },
          { label: doc.title },
        ]}
        actions={
          <button className="h-9 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download
          </button>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Metadata */}
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-border">
            <div className="px-5 py-4">
              <div className="text-[11px] text-muted uppercase tracking-wider">
                Status
              </div>
              <div className="mt-2">
                <StatusBadge status={doc.status} />
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[11px] text-muted uppercase tracking-wider">
                Pages
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {doc.page_count ?? "—"}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[11px] text-muted uppercase tracking-wider">
                Vector chunks
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {doc.chunk_count.toLocaleString()}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[11px] text-muted uppercase tracking-wider">
                File size
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatBytes(doc.file_size)}
              </div>
            </div>
            <div className="px-5 py-4 col-span-2 md:col-span-1">
              <div className="text-[11px] text-muted uppercase tracking-wider">
                Uploaded
              </div>
              <div className="mt-1 text-sm font-medium">
                {formatDateTime(doc.created_at)}
              </div>
              <div className="text-[11px] text-muted truncate">
                {doc.mime_type}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chunks */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Indexed chunks"
              description="Vector chunks live in the RAG index once ingestion completes."
              action={
                <span className="text-xs text-muted">
                  {doc.chunk_count.toLocaleString()} indexed
                </span>
              }
            />
            <div className="px-5 py-12 text-center text-sm text-muted">
              {doc.status === "READY"
                ? "Chunks are indexed for retrieval. Use Search to find related docs, or Ask to get cited answers."
                : doc.status === "FAILED"
                  ? "Ingestion failed for this document. Delete and re-upload to retry."
                  : "Chunks will appear here once processing completes."}
            </div>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Related audits"
                description={`${relatedAudits.length} audit${
                  relatedAudits.length === 1 ? "" : "s"
                } for this document`}
              />
              {relatedAudits.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted">
                  No audits have been run yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {relatedAudits.map((a) => {
                    const worst = [...a.findings].sort(
                      (x, y) =>
                        severityRank(y.severity) - severityRank(x.severity),
                    )[0];
                    return (
                      <li key={a.id}>
                        <Link
                          href={`/audits/${a.id}`}
                          className="block px-5 py-3.5 hover:bg-surface-2 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <FrameworkBadge framework={a.framework} />
                            <span className="text-xs text-muted tabular-nums">
                              {a.findings.length} finding
                              {a.findings.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          {worst && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[11px] text-muted">
                                Worst:
                              </span>
                              <SeverityBadge
                                severity={worst.severity}
                                size="sm"
                              />
                            </div>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Pipeline" />
              <ol className="px-5 py-4 space-y-3.5 text-xs">
                {[
                  {
                    label: "Uploaded",
                    detail: formatDateTime(doc.created_at),
                    done: true,
                  },
                  {
                    label: "Text extraction",
                    detail:
                      doc.status === "PENDING" ? "queued" : "in worker",
                    done: doc.status !== "PENDING",
                  },
                  {
                    label: "Chunking + embedding",
                    detail:
                      doc.status === "READY"
                        ? `${doc.chunk_count.toLocaleString()} chunks`
                        : "—",
                    done: doc.status === "READY",
                  },
                  {
                    label: "Available for search",
                    detail:
                      doc.status === "READY"
                        ? formatDateTime(doc.updated_at)
                        : doc.status === "FAILED"
                          ? "failed"
                          : "pending",
                    done: doc.status === "READY",
                  },
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        step.done
                          ? "bg-success border-success text-white"
                          : "border-border bg-surface"
                      }`}
                    >
                      {step.done && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-2.5 w-2.5"
                        >
                          <path
                            d="M20 6L9 17l-5-5"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-medium ${
                          step.done ? "text-foreground" : "text-muted"
                        }`}
                      >
                        {step.label}
                      </div>
                      <div className="text-muted-2">{step.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
