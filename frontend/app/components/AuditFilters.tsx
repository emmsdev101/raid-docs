"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FrameworkBadge, SeverityBadge, StatusBadge } from "./Badges";
import type { ApiAudit } from "../lib/api";
import { relativeTime, severityRank } from "../lib/format";

export function AuditFilters({ audits }: { audits: ApiAudit[] }) {
  const [framework, setFramework] = useState<string>("ALL");

  const frameworks = useMemo(
    () => ["ALL", ...Array.from(new Set(audits.map((a) => a.framework)))],
    [audits],
  );

  const filtered = useMemo(
    () =>
      framework === "ALL"
        ? audits
        : audits.filter((a) => a.framework === framework),
    [audits, framework],
  );

  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted">
        No audits yet. Run one from a document&apos;s detail page to get started.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {frameworks.map((f) => (
          <button
            key={f}
            onClick={() => setFramework(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              framework === f
                ? "bg-primary text-white border-primary"
                : "bg-surface text-foreground border-border hover:bg-surface-2"
            }`}
          >
            {f === "ALL" ? "All frameworks" : f}
            <span
              className={`ml-1.5 text-[10px] ${
                framework === f ? "text-white/70" : "text-muted"
              }`}
            >
              {f === "ALL"
                ? audits.length
                : audits.filter((a) => a.framework === f).length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((audit) => {
          const worst = [...audit.findings].sort(
            (x, y) => severityRank(y.severity) - severityRank(x.severity),
          )[0];
          const counts = audit.findings.reduce(
            (acc, f) => {
              acc[f.severity] += 1;
              return acc;
            },
            { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<
              string,
              number
            >,
          );
          return (
            <Link
              key={audit.id}
              href={`/audits/${audit.id}`}
              className="group rounded-xl border border-border bg-surface p-5 hover:border-border-strong transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <FrameworkBadge framework={audit.framework} />
                  <StatusBadge status={audit.status} />
                </div>
                <span className="text-[11px] text-muted">
                  {relativeTime(audit.created_at)}
                </span>
              </div>
              <div className="text-sm font-semibold group-hover:text-primary transition-colors">
                {audit.document_title ?? "Untitled document"}
              </div>
              {audit.status === "PENDING" || audit.status === "PROCESSING" ? (
                <div className="mt-4 rounded-lg bg-bg border border-border p-3 text-xs text-muted">
                  Analysis in progress…
                </div>
              ) : audit.status === "FAILED" ? (
                <div className="mt-4 rounded-lg bg-bg border border-border p-3 text-xs text-danger">
                  {audit.error_message ?? "Audit failed"}
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                        Findings
                      </div>
                      <div className="text-3xl font-semibold tabular-nums">
                        {audit.findings.length}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(
                        (sev) =>
                          counts[sev] > 0 && (
                            <div key={sev} className="flex items-center gap-1">
                              <SeverityBadge severity={sev} size="sm" />
                              <span className="text-xs tabular-nums font-medium">
                                {counts[sev]}
                              </span>
                            </div>
                          ),
                      )}
                    </div>
                  </div>
                  {worst ? (
                    <div className="mt-4 rounded-lg bg-bg border border-border p-3">
                      <div className="text-[11px] text-muted uppercase tracking-wider mb-1">
                        Worst finding
                      </div>
                      <div className="text-xs font-medium truncate">
                        {worst.clause}
                      </div>
                      <p className="mt-1 text-xs text-muted line-clamp-2">
                        {worst.issue_description}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg bg-bg border border-border p-3 text-xs text-muted">
                      No findings recorded for this audit.
                    </div>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
