"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "../lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const items: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4a1 1 0 001-1v-5h2v5a1 1 0 001 1h4a1 1 0 001-1V10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/documents",
    label: "Documents",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6M8 13h8M8 17h6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/ask",
    label: "Ask",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2zM19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    href: "/audits",
    label: "Compliance Audits",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function orgLabelFromEmail(email: string | undefined): string {
  if (!email) return "Workspace";
  const domain = email.split("@")[1];
  if (!domain) return "Workspace";
  const head = domain.split(".")[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const orgLabel = orgLabelFromEmail(user?.email);
  const orgInitial = orgLabel.charAt(0).toUpperCase();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-surface flex-col">
      <div className="h-16 flex items-center px-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">
            R
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">RaidDocs</span>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              AI
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary-soft text-primary font-medium"
                      : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`${
                      active ? "text-primary" : "text-muted group-hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
              {orgInitial}
            </div>
            <div className="text-xs font-medium truncate">{orgLabel}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted">Role</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-soft text-primary">
              {user?.role ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
