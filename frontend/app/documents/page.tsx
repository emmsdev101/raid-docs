"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { UploadZone } from "../components/UploadZone";
import { DocumentFilters } from "../components/DocumentFilters";
import { useAuth } from "../lib/auth-context";
import { api, ApiError, type ApiDocument } from "../lib/api";

export default function DocumentsPage() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      setError(null);
      try {
        const rows = await api.listDocuments(token, signal);
        if (signal?.aborted) return;
        setDocuments(rows);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load documents",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Upload contracts, policies, and reports. Each document is chunked, embedded, and made available for semantic search and compliance auditing."
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <UploadZone onUploaded={() => void refresh()} />

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">
              All documents
              <span className="ml-2 text-xs text-muted font-normal">
                {loading ? "…" : `${documents.length} total`}
              </span>
            </h2>
          </div>
          {error && (
            <div className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          {loading ? (
            <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted">
              Loading documents…
            </div>
          ) : (
            <DocumentFilters documents={documents} />
          )}
        </div>
      </div>
    </div>
  );
}
