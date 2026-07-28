"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../lib/auth-context";
import { api, ApiError, type ApiCitation } from "../lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  citations?: ApiCitation[];
  error?: boolean;
};

const suggestedQuestions = [
  "Summarize the key obligations in our data retention policy.",
  "What are our commitments around encryption in transit?",
  "How do we handle personal-data erasure requests?",
  "List every access-control clause across our uploaded policies.",
];

/** Sync `?q=` without triggering a Next.js navigation / remount. */
function syncQueryParam(question: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("q") === question) return;
  url.searchParams.set("q", question);
  window.history.replaceState(window.history.state, "", url.toString());
}

function dedupeCitations(citations: ApiCitation[]): ApiCitation[] {
  const best = new Map<string, ApiCitation>();
  for (const c of citations) {
    const prev = best.get(c.document_id);
    if (!prev || c.score > prev.score) best.set(c.document_id, c);
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}

function CitationSources({ citations }: { citations: ApiCitation[] }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sources = dedupeCitations(citations);

  return (
    <div className="rounded-lg border border-border bg-bg/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors"
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
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Sources
        </span>
        <span className="text-[11px] text-muted-2">
          {sources.length} document{sources.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[10px] text-muted-2">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <ul className="border-t border-border divide-y divide-border">
          {sources.map((c, idx) => {
            const title =
              c.document_title || `${c.document_id.slice(0, 8)}…`;
            const isExpanded = expandedId === c.chunk_id;
            return (
              <li key={`${c.chunk_id}-${idx}`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary-soft text-[10px] font-semibold text-primary">
                    {idx + 1}
                  </span>
                  <Link
                    href={`/documents/${c.document_id}`}
                    className="text-xs font-medium truncate flex-1 min-w-0 hover:text-primary"
                    title={title}
                  >
                    {title}
                  </Link>
                  <span className="text-[10px] font-mono tabular-nums text-success shrink-0">
                    {(c.score * 100).toFixed(0)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : c.chunk_id)
                    }
                    className="text-[10px] text-muted hover:text-foreground shrink-0 px-1"
                    aria-label={isExpanded ? "Hide excerpt" : "Show excerpt"}
                  >
                    {isExpanded ? "Less" : "Excerpt"}
                  </button>
                </div>
                {isExpanded && (
                  <p className="px-3 pb-2 pl-10 text-xs text-muted leading-relaxed">
                    {c.snippet}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SearchChat() {
  const searchParams = useSearchParams();
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs avoid stale closures and remount races.
  const tokenRef = useRef(token);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  tokenRef.current = token;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = async (text: string) => {
    const question = text.trim();
    const authToken = tokenRef.current;
    if (!question || !authToken || submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    autoSubmittedRef.current = question;
    syncQueryParam(question);

    const requestId = ++requestIdRef.current;
    const userMsg: Message = {
      id: `u-${requestId}`,
      role: "user",
      content: question,
    };
    const assistantId = `a-${requestId}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");

    try {
      // No AbortSignal — remounts from Suspense/navigation were cancelling
      // long-running RAG calls. A newer submit simply ignores older results.
      const response = await api.chat(authToken, { question });
      if (requestId !== requestIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                streaming: false,
                content:
                  response.answer ||
                  "The model did not return an answer for that question.",
                citations: response.citations,
              }
            : m,
        ),
      );
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message =
        err instanceof ApiError
          ? err.status === 0
            ? "Couldn't reach the API. Is the backend running?"
            : err.message
          : "Something went wrong while asking the model.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, content: message, error: true }
            : m,
        ),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  // Auto-run once when landing with ?q=… (e.g. from the Topbar).
  useEffect(() => {
    const q = searchParams?.get("q")?.trim() ?? "";
    if (!q || !token) return;
    if (autoSubmittedRef.current === q) return;
    autoSubmittedRef.current = q;
    void submit(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / URL only
  }, [searchParams, token]);

  const renderContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
    return parts.map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (/^\[\d+\]$/.test(part)) {
        return (
          <sup
            key={i}
            className="mx-0.5 inline-flex items-center justify-center rounded bg-primary-soft px-1 py-0.5 text-[10px] font-semibold text-primary cursor-pointer"
          >
            {part.slice(1, -1)}
          </sup>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const orgLabel = (() => {
    const domain = user?.email?.split("@")[1];
    if (!domain) return "your workspace";
    const head = domain.split(".")[0];
    return head.charAt(0).toUpperCase() + head.slice(1);
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[900px] rounded-xl border border-border bg-surface overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary mb-4">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
                <path
                  d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2zM19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 18l.7 2.1L8 21l-2.1.7L5 24l-.7-2.3L2 21l2.3-.9L5 18z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Ask your knowledge base</h2>
            <p className="mt-1.5 max-w-md text-sm text-muted">
              Powered by retrieval-augmented generation over your organization&apos;s
              indexed documents. Answers include page-level citations.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => void submit(q)}
                  disabled={isSubmitting}
                  className="text-left text-xs rounded-lg border border-border bg-bg px-3.5 py-3 hover:bg-surface-2 hover:border-border-strong disabled:opacity-60 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-muted mt-0.5 group-hover:text-primary transition-colors">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-3.5 w-3.5"
                      >
                        <path
                          d="M9 5l7 7-7 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>{q}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-primary text-white px-4 py-2.5 text-sm">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary mt-0.5">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4"
                      >
                        <path
                          d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      {msg.streaming && !msg.content ? (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Thinking…
                        </div>
                      ) : (
                        <div
                          className={`text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.error ? "text-danger" : "text-foreground"
                          }`}
                        >
                          {renderContent(msg.content)}
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary animate-blink" />
                          )}
                        </div>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <CitationSources citations={msg.citations} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
          className="flex items-end gap-2 rounded-xl border border-border bg-bg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all p-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            rows={1}
            placeholder="Ask about policies, contracts, or compliance controls…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-2 focus:outline-none max-h-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-3 w-3"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-2 px-2">
          <span>Tenant-scoped answers · {orgLabel}</span>
          <span>
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono">
              ⏎
            </kbd>{" "}
            to send ·{" "}
            <kbd className="rounded border border-border bg-surface px-1 py-0.5 font-mono">
              ⇧⏎
            </kbd>{" "}
            for newline
          </span>
        </div>
      </div>
    </div>
  );
}
