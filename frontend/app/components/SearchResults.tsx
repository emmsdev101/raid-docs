"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "./Badges";
import { useAuth } from "../lib/auth-context";
import {
  api,
  ApiError,
  type ApiSearchDocumentHit,
  type ApiSearchResponse,
  type DocStatus,
} from "../lib/api";
import { formatDate } from "../lib/format";

export function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const q = searchParams?.get("q")?.trim() ?? "";

  const [input, setInput] = useState(q);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiSearchResponse | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    if (!token || !q) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    api
      .searchDocuments(token, q, { top_k: 20 })
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setResult(res);
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        setResult(null);
        setError(
          err instanceof ApiError
            ? err.status === 0
              ? "Couldn't reach the API. Is the backend running?"
              : err.message
            : "Search failed. Please try again.",
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [token, q]);

  function runSearch(raw: string) {
    const next = raw.trim();
    if (!next) return;
    router.push(`/search?q=${encodeURIComponent(next)}`);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(input);
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by document name or topic…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          autoFocus
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {!q && (
        <div className="rounded-xl border border-border bg-surface px-6 py-14 text-center">
          <h2 className="text-base font-semibold">Search your documents</h2>
          <p className="mt-2 text-sm text-muted max-w-md mx-auto">
            Find files by name or topic, then skim an AI insight on what they say.
            For a conversation with citations, use{" "}
            <Link href="/ask" className="text-primary hover:underline">
              Ask
            </Link>
            .
          </p>
        </div>
      )}

      {q && loading && (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-border border-t-primary animate-spin" />
            Searching for “{q}”…
          </span>
        </div>
      )}

      {q && error && !loading && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {q && result && !loading && (
        <div className="space-y-5">
          <DocumentResults query={result.query} documents={result.documents} />
          <AiInsight
            insight={result.insight}
            documentCount={result.documents.length}
          />
        </div>
      )}
    </div>
  );
}

function DocumentResults({
  query,
  documents,
}: {
  query: string;
  documents: ApiSearchDocumentHit[];
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold">
          Documents
          <span className="ml-2 text-xs font-normal text-muted">
            {documents.length} result{documents.length === 1 ? "" : "s"} for “
            {query}”
          </span>
        </h2>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-10 text-center text-sm text-muted">
          No documents matched this query. Try a filename fragment or a different
          topic.
        </div>
      ) : (
        <ul className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/documents/${doc.id}`}
                className="block px-4 py-3.5 hover:bg-surface-2 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:bg-primary-soft group-hover:text-primary transition-colors mt-0.5">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <path
                        d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-primary group-hover:underline truncate">
                        {doc.title}
                      </span>
                      {doc.status && (
                        <StatusBadge status={doc.status as DocStatus} />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                      {doc.snippet}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-2">
                      <span className="font-mono tabular-nums text-success">
                        {(Math.min(doc.score, 1) * 100).toFixed(0)}% match
                      </span>
                      {doc.mime_type && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{shortMime(doc.mime_type)}</span>
                        </>
                      )}
                      {doc.updated_at && (
                        <>
                          <span aria-hidden>·</span>
                          <span>Updated {formatDate(doc.updated_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AiInsight({
  insight,
  documentCount,
}: {
  insight: string;
  documentCount: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`h-3 w-3 text-muted shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M9 5l7 7-7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path
              d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            AI insight
          </div>
          <div className="text-[11px] text-muted-2">
            Based on {documentCount} document
            {documentCount === 1 ? "" : "s"}
          </div>
        </div>
        <span className="ml-auto text-[10px] text-muted-2">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 text-sm leading-relaxed whitespace-pre-wrap border-t border-border">
          <div className="pt-3">{insight}</div>
        </div>
      )}
    </section>
  );
}

function shortMime(mime: string): string {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word") || mime.includes("docx")) return "DOCX";
  if (mime.includes("text") || mime.includes("markdown")) return "Text";
  if (mime.includes("html")) return "HTML";
  return mime.split("/").pop()?.toUpperCase() || mime;
}
