"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function isSafeNext(next: string | null): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return true;
}

function orgHintFromEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".")) return null;
  if (PERSONAL_DOMAINS.has(domain)) return null;
  const head = domain.split(".")[0]?.replace(/[^A-Za-z0-9-]/g, "");
  if (!head) return null;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, register } = useAuth();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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

  const orgHint = useMemo(() => orgHintFromEmail(email), [email]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || null,
      });
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError(
            "An account with that email already exists. Try signing in instead.",
          );
        } else if (err.status === 422) {
          setError("Please double-check the fields and try again.");
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
              Create your account
            </h1>
            <p className="mt-1 text-sm text-muted">
              We&apos;ll match you to your team&apos;s workspace automatically.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-medium text-foreground/80 mb-1.5"
              >
                Full name{" "}
                <span className="font-normal text-muted-2">(optional)</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

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
              <p className="mt-1.5 text-[11px] text-muted-2">
                {orgHint
                  ? `You'll join the "${orgHint}" workspace (first person there? You'll be the admin).`
                  : "Personal-email accounts get a private single-seat workspace."}
              </p>
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
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link
              href={
                nextParam
                  ? `/login?next=${encodeURIComponent(nextParam)}`
                  : "/login"
              }
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-2">
          By continuing you agree to the terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
