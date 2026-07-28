"use client";

import { useState } from "react";

import { useAuth } from "../lib/auth-context";
import { api, ApiError } from "../lib/api";
import { formatBytes } from "../lib/format";

type PendingFile = {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "failed";
  error?: string;
};

type UploadZoneProps = {
  onUploaded?: () => void;
};

export function UploadZone({ onUploaded }: UploadZoneProps) {
  const { token } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);

  const upload = async (fileList: File[]) => {
    if (!token) return;
    const entries: PendingFile[] = fileList.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      size: f.size,
      status: "uploading",
    }));
    setFiles((prev) => [...entries, ...prev]);

    await Promise.all(
      entries.map(async (entry, index) => {
        const file = fileList[index];
        try {
          await api.uploadDocument(token, file);
          setFiles((prev) =>
            prev.map((p) =>
              p.id === entry.id ? { ...p, status: "ready" } : p,
            ),
          );
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.status === 413
                ? "File exceeds the size limit."
                : err.message
              : "Upload failed";
          setFiles((prev) =>
            prev.map((p) =>
              p.id === entry.id
                ? { ...p, status: "failed", error: message }
                : p,
            ),
          );
        }
      }),
    );

    if (onUploaded) onUploaded();
  };

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void upload(Array.from(list));
  };

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary-soft"
            : "border-border bg-surface hover:bg-surface-2"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full mb-3 ${
            isDragging
              ? "bg-primary text-white"
              : "bg-surface-2 text-muted"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-sm font-medium">
          {isDragging
            ? "Drop to start ingestion"
            : "Drag & drop files here, or click to browse"}
        </div>
        <div className="mt-1 text-xs text-muted">
          Supports PDF, DOCX, TXT, MD
        </div>
      </label>

      {files.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium">
              Recent uploads ({files.length})
            </span>
            <button
              onClick={() => setFiles([])}
              className="text-[11px] text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">
                      {f.name}
                    </span>
                    <span className="text-[10px] text-muted tabular-nums">
                      {formatBytes(f.size)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        f.status === "ready"
                          ? "bg-success w-full"
                          : f.status === "failed"
                            ? "bg-danger w-full"
                            : "bg-primary w-2/3 animate-pulse"
                      }`}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-muted">
                    {f.status === "uploading" && "Uploading…"}
                    {f.status === "ready" && "Uploaded — queued for ingestion"}
                    {f.status === "failed" && (f.error ?? "Upload failed")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
