export function StatCard({
  label,
  value,
  delta,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  icon?: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  const toneMap = {
    neutral: "bg-surface-2 text-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && (
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneMap[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className={`text-xs font-medium ${
              delta.positive ? "text-success" : "text-danger"
            }`}
          >
            {delta.positive ? "▲" : "▼"} {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}
