/**
 * Small pure formatters shared across UI components. No mock data, no API
 * types — this module is safe to import from anywhere.
 */

import type { RiskSeverity } from "./api";

export function severityRank(s: RiskSeverity): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[s];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diff = (now.getTime() - then.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}

/** Deterministic pastel color for an id — used for user avatars. */
export function colorFromId(id: string): string {
  const palette = [
    "#4f46e5",
    "#0ea5e9",
    "#16a34a",
    "#ea580c",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
    "#d97706",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function initialsFromName(name: string | null, email?: string): string {
  const source = (name && name.trim()) || (email && email.split("@")[0]) || "";
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
