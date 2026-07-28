import type { DocStatus, RiskSeverity, Role } from "../lib/api";

export function StatusBadge({ status }: { status: DocStatus }) {
  const config: Record<
    DocStatus,
    { label: string; bg: string; text: string; dot: string }
  > = {
    PENDING: {
      label: "Pending",
      bg: "bg-surface-2",
      text: "text-muted",
      dot: "bg-muted-2",
    },
    PROCESSING: {
      label: "Processing",
      bg: "bg-info-soft",
      text: "text-info",
      dot: "bg-info animate-pulse",
    },
    READY: {
      label: "Ready",
      bg: "bg-success-soft",
      text: "text-success",
      dot: "bg-success",
    },
    FAILED: {
      label: "Failed",
      bg: "bg-danger-soft",
      text: "text-danger",
      dot: "bg-danger",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function SeverityBadge({
  severity,
  size = "md",
}: {
  severity: RiskSeverity;
  size?: "sm" | "md";
}) {
  const config: Record<
    RiskSeverity,
    { label: string; bg: string; text: string }
  > = {
    LOW: {
      label: "Low",
      bg: "bg-severity-low-soft",
      text: "text-severity-low",
    },
    MEDIUM: {
      label: "Medium",
      bg: "bg-severity-medium-soft",
      text: "text-severity-medium",
    },
    HIGH: {
      label: "High",
      bg: "bg-severity-high-soft",
      text: "text-severity-high",
    },
    CRITICAL: {
      label: "Critical",
      bg: "bg-severity-critical-soft",
      text: "text-severity-critical",
    },
  };
  const c = config[severity];
  const sizing =
    size === "sm"
      ? "px-1.5 py-0.5 text-[10px]"
      : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold uppercase tracking-wide ${sizing} ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const config: Record<Role, { bg: string; text: string }> = {
    ADMIN: { bg: "bg-primary-soft", text: "text-primary" },
    MEMBER: { bg: "bg-info-soft", text: "text-info" },
    VIEWER: { bg: "bg-surface-2", text: "text-muted" },
  };
  const c = config[role];
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.bg} ${c.text}`}
    >
      {role}
    </span>
  );
}

export function FrameworkBadge({ framework }: { framework: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
      {framework}
    </span>
  );
}
