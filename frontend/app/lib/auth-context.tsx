"use client";

/**
 * Client-side auth store.
 *
 * Keeps three pieces of state:
 *   - `token`  — bearer token sent to the backend on every request.
 *   - `user`   — the current `ApiUser` (matches `UserOut` on the API).
 *   - `status` — 'loading' | 'authenticated' | 'unauthenticated'.
 *
 * Persistence is intentionally minimal: the token lives in `localStorage`
 * and, on first mount, we call `GET /users/me` to re-hydrate the user. If
 * the request 401/404s the session is cleared.
 *
 * Auth flow (email + password):
 *   - `login(email, password)`     -> POST /auth/login
 *   - `register({email, password, name?})` -> POST /auth/register
 * Both return a JWT which is stored and attached to subsequent API calls.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  ApiError,
  api,
  type ApiUser,
  type LoginPayload,
  type RegisterPayload,
} from "./api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: ApiUser | null;
  token: string | null;
  /** Sign in with an email/password. Throws `ApiError` on failure. */
  login: (payload: LoginPayload) => Promise<ApiUser>;
  /** Create a new account and start a session. */
  register: (payload: RegisterPayload) => Promise<ApiUser>;
  /** Clear the session and (optionally) redirect. */
  logout: (redirectTo?: string) => void;
  /** Force a re-fetch of `/users/me`. */
  refresh: () => Promise<void>;
};

const TOKEN_STORAGE_KEY = "raid_docs.auth_token";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const hydratedRef = useRef(false);

  const persistToken = useCallback((next: string | null) => {
    setToken(next);
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(TOKEN_STORAGE_KEY, next);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const clearSession = useCallback(() => {
    persistToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, [persistToken]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<ApiUser> => {
      const res = await api.login(payload);
      persistToken(res.access_token);
      setUser(res.user);
      setStatus("authenticated");
      return res.user;
    },
    [persistToken],
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<ApiUser> => {
      const res = await api.register(payload);
      persistToken(res.access_token);
      setUser(res.user);
      setStatus("authenticated");
      return res.user;
    },
    [persistToken],
  );

  const logout = useCallback(
    (redirectTo?: string) => {
      clearSession();
      if (redirectTo) router.replace(redirectTo);
    },
    [clearSession, router],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.getMe(token);
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        clearSession();
      }
    }
  }, [token, clearSession]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (typeof window === "undefined") {
      setStatus("unauthenticated");
      return;
    }

    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setStatus("unauthenticated");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe(stored);
        if (cancelled) return;
        setToken(stored);
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, login, register, logout, refresh }),
    [status, user, token, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
