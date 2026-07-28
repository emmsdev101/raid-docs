"use client";

/**
 * Root-level chrome switcher.
 *
 * Responsibilities:
 *   - Render `/login` and `/register` full-screen with no sidebar/topbar.
 *   - For every other route, require an authenticated session. When we don't
 *     have one, redirect to `/login?next=<current>`.
 *   - While auth is still hydrating from localStorage, show a subtle loader
 *     instead of flashing the sidebar and then bouncing to `/login`.
 */

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "../lib/auth-context";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}

function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin" />
        <span className="text-xs">{label}</span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useAuth();

  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (isPublic) return;
    if (status !== "unauthenticated") return;

    const query = searchParams?.toString();
    const nextParam = query ? `${pathname}?${query}` : pathname;
    const search = new URLSearchParams({ next: nextParam }).toString();
    router.replace(`/login?${search}`);
  }, [isPublic, status, pathname, searchParams, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return <FullPageLoader label="Restoring your session…" />;
  }

  if (status === "unauthenticated") {
    return <FullPageLoader label="Redirecting to sign in…" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
