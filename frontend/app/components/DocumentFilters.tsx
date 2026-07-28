"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "./Badges";
import type { ApiDocument, DocStatus } from "../lib/api";
import { formatBytes, relativeTime } from "../lib/format";

const statuses: (DocStatus | "ALL")[] = [
  "ALL",
  "READY",
  "PROCESSING",
  "PENDING",
  "FAILED",
];

export function DocumentFilters({ documents }: { documents: ApiDocument[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DocStatus | "ALL">("ALL");

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      const matchStatus = status === "ALL" || d.status === status;
      const matchQuery =
        !query || d.title.toLowerCase().includes(query.toLowerCase());
      return matchStatus && matchQuery;
    });
  }, [documents, query, status]);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Filter documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg pl-9 pr-3 py-1.5 text-xs placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-0.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                status === s
                  ? "bg-surface shadow-sm text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted">
          {documents.length === 0
            ? "No documents yet. Upload your first file above to get started."
            : "No documents match this filter."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted bg-surface-2/50">
              <th className="px-5 py-2.5 font-medium">Document</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">
                Status
              </th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">
                Pages
              </th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">
                Chunks
              </th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">
                Size
              </th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">
                Uploaded
              </th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((doc) => (
              <tr
                key={doc.id}
                className="hover:bg-surface-2 transition-colors group"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="flex items-center gap-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:bg-primary-soft group-hover:text-primary transition-colors">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4"
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
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {doc.title}
                      </div>
                      <div className="text-[11px] text-muted">
                        {doc.mime_type}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs tabular-nums text-muted">
                  {doc.page_count ?? "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs tabular-nums text-muted">
                  {doc.chunk_count || "—"}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs tabular-nums text-muted">
                  {formatBytes(doc.file_size)}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted">
                  {relativeTime(doc.created_at)}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/documents/${doc.id}`}
                    className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
