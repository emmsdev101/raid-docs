"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../lib/auth-context";
import { colorFromId, initialsFromName } from "../lib/format";

export function Topbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function goToSearch(raw: string) {
    const q = raw.trim();
    if (!q) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const email = user?.email ?? "";
  const displayName = user?.name?.trim() || email;
  const role = user?.role ?? "";
  const initials = initialsFromName(user?.name ?? null, email);
  const avatarColor = user ? colorFromId(user.id) : "#71717a";

  return (
    <header className="sticky top-0 z-10 h-16 border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
        <div className="flex-1 max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goToSearch(searchQuery);
            }}
          >
            <label className="relative block">
              <span className="sr-only">Search</span>
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
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-lg border border-border bg-bg pl-9 pr-16 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-[10px] text-muted">
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">
                  ⌘
                </kbd>
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">
                  K
                </kbd>
              </span>
            </label>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <button className="hidden sm:flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>Upload</span>
          </button>

          <button
            className="relative h-9 w-9 rounded-lg border border-border bg-surface hover:bg-surface-2 flex items-center justify-center transition-colors"
            aria-label="Notifications"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
          </button>

          <div
            ref={menuRef}
            className="relative flex items-center gap-2 pl-2 border-l border-border ml-1"
          >
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-2 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div className="hidden md:flex flex-col leading-tight text-left">
                <span className="text-xs font-medium truncate max-w-[10rem]">
                  {displayName || "Signed in"}
                </span>
                <span className="text-[10px] text-muted">{role}</span>
              </div>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-3.5 w-3.5 text-muted hidden md:block"
                aria-hidden
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-surface shadow-lg py-1.5 z-20"
              >
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-xs font-medium truncate">
                    {displayName || "Signed in"}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {email || role}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/team");
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors"
                >
                  Team & workspace
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    logout("/login");
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-danger hover:bg-surface-2 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
