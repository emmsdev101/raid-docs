"use client";

import { useState } from "react";
import { SeverityBadge } from "./Badges";
import type { ApiAuditFinding } from "../lib/api";

export function FindingRow({ finding }: { finding: ApiAuditFinding }) {
  const [open, setOpen] = useState(finding.severity === "CRITICAL");

  const severityAccent = {
    CRITICAL: "border-l-severity-critical",
    HIGH: "border-l-severity-high",
    MEDIUM: "border-l-severity-medium",
    LOW: "border-l-severity-low",
  }[finding.severity];

  return (
    <div
      className={`rounded-lg border border-border border-l-4 ${severityAccent} bg-surface overflow-hidden`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-4 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <SeverityBadge severity={finding.severity} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{finding.clause}</div>
            {!open && (
              <p className="mt-1 text-xs text-muted line-clamp-1">
                {finding.issue_description}
              </p>
            )}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3.5 border-t border-border">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5 mt-2">
              Issue
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {finding.issue_description}
            </p>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-success mb-1.5">
              Recommended remediation
            </div>
            <div className="rounded-lg border border-success/20 bg-success-soft/40 p-3">
              <p className="text-sm leading-relaxed text-foreground/90">
                {finding.remediation}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button className="text-xs font-medium rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-surface-2 transition-colors">
              Mark as resolved
            </button>
            <button className="text-xs font-medium rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-surface-2 transition-colors">
              Create ticket
            </button>
            <button className="text-xs font-medium rounded-md border border-border bg-surface px-2.5 py-1 hover:bg-surface-2 transition-colors text-muted">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
