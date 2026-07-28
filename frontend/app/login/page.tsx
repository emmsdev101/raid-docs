"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

function isSafeNext(next: string | null): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextParam = searchParams?.get("next") ?? null;
  const nextPath = isSafeNext(nextParam) ? nextParam : "/";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [status, nextPath, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Incorrect email or password.");
        } else if (err.status === 422) {
          setError("Please enter a valid email and password.");
        } else if (err.status === 0) {
          setError(
            "Can't reach the API. Is the backend running on the expected port?",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-bg">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white font-bold text-lg shadow-sm">
            R
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              Welcome back to RaidDocs
            </h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to continue to your workspace.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-foreground/80 mb-1.5"
              >
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-foreground/80 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3 text-[11px] text-muted">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="mt-5 text-center text-sm text-muted">
            New to RaidDocs?{" "}
            <Link
              href={
                nextParam
                  ? `/register?next=${encodeURIComponent(nextParam)}`
                  : "/register"
              }
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-2">
          Your workspace is chosen automatically from your email domain.
        </p>
      </div>
    </div>
  );
}
