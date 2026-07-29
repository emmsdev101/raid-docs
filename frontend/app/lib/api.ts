/**
 * Thin fetch wrapper around the RAID Docs FastAPI backend.
 *
 * Design goals:
 *   - Zero runtime dependencies. Just `fetch` + typed helpers.
 *   - Bearer token is passed in explicitly by the caller (usually via the
 *     AuthProvider) — the client is not aware of localStorage on its own,
 *     which keeps it usable from Server Components / tests / etc.
 *   - Errors surface as `ApiError` with `status`, `code`, and a message
 *     lifted from the FastAPI `{ "detail": "…" }` envelope when present.
 */

export type Role = "ADMIN" | "MEMBER" | "VIEWER";
export type DocStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
export type AuditStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ApiUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organization_id: string;
  created_at: string;
};

export type ApiOrganization = {
  id: string;
  name: string;
  domain: string | null;
  created_at: string;
  member_count: number;
};

export type ApiDocument = {
  id: string;
  title: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  status: DocStatus;
  page_count: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export type ApiAuditFinding = {
  id: string;
  severity: RiskSeverity;
  clause: string;
  issue_description: string;
  remediation: string;
};

export type ApiAudit = {
  id: string;
  document_id: string;
  document_title: string | null;
  organization_id: string;
  framework: string;
  status: AuditStatus;
  error_message: string | null;
  created_at: string;
  findings: ApiAuditFinding[];
};

export type ApiAuditStatus = {
  id: string;
  status: AuditStatus;
  error_message: string | null;
};

export type ApiCitation = {
  document_id: string;
  chunk_id: string;
  score: number;
  snippet: string;
  document_title?: string | null;
};

export type ApiChatResponse = {
  answer: string;
  citations: ApiCitation[];
};

export type ApiSearchDocumentHit = {
  id: string;
  title: string;
  score: number;
  snippet: string;
  status?: DocStatus | null;
  mime_type?: string | null;
  updated_at?: string | null;
};

export type ApiSearchResponse = {
  insight: string;
  documents: ApiSearchDocumentHit[];
  query: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  name?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: ApiUser;
};

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

function getBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body, signal } = opts;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : "Network request failed",
      0,
      err,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      (isJson &&
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof (payload as { detail: unknown }).detail === "string" &&
        (payload as { detail: string }).detail) ||
      response.statusText ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

async function uploadRequest<T>(
  path: string,
  formData: FormData,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : "Network request failed",
      0,
      err,
    );
  }

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (isJson &&
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof (payload as { detail: unknown }).detail === "string" &&
        (payload as { detail: string }).detail) ||
      response.statusText ||
      `Upload failed with status ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────
  getMe(token: string, signal?: AbortSignal): Promise<ApiUser> {
    return request<ApiUser>("/users/me", { token, signal });
  },
  register(payload: RegisterPayload, signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: payload,
      signal,
    });
  },
  login(payload: LoginPayload, signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: payload,
      signal,
    });
  },

  // ── Users / organization ─────────────────────────────────────────────
  listTeamMembers(token: string, signal?: AbortSignal): Promise<ApiUser[]> {
    return request<ApiUser[]>("/users", { token, signal });
  },
  getOrganization(token: string, signal?: AbortSignal): Promise<ApiOrganization> {
    return request<ApiOrganization>("/users/organization", { token, signal });
  },

  // ── Documents ────────────────────────────────────────────────────────
  listDocuments(token: string, signal?: AbortSignal): Promise<ApiDocument[]> {
    return request<ApiDocument[]>("/documents", { token, signal });
  },
  getDocument(token: string, id: string, signal?: AbortSignal): Promise<ApiDocument> {
    return request<ApiDocument>(`/documents/${id}`, { token, signal });
  },
  uploadDocument(
    token: string,
    file: File,
    signal?: AbortSignal,
  ): Promise<ApiDocument> {
    const formData = new FormData();
    formData.append("file", file);
    return uploadRequest<ApiDocument>("/documents/upload", formData, token, signal);
  },
  deleteDocument(token: string, id: string): Promise<void> {
    return request<void>(`/documents/${id}`, { method: "DELETE", token });
  },

  // ── Audits ───────────────────────────────────────────────────────────
  listAudits(token: string, signal?: AbortSignal): Promise<ApiAudit[]> {
    return request<ApiAudit[]>("/audits", { token, signal });
  },
  getAudit(token: string, id: string, signal?: AbortSignal): Promise<ApiAudit> {
    return request<ApiAudit>(`/audits/${id}`, { token, signal });
  },
  getAuditStatus(
    token: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<ApiAuditStatus> {
    return request<ApiAuditStatus>(`/audits/${id}/status`, { token, signal });
  },
  createAudit(
    token: string,
    payload: { document_id: string; framework: string },
    signal?: AbortSignal,
  ): Promise<ApiAudit> {
    return request<ApiAudit>("/audits", {
      method: "POST",
      token,
      body: payload,
      signal,
    });
  },

  // ── Chat / RAG ───────────────────────────────────────────────────────
  chat(
    token: string,
    payload: { question: string; document_ids?: string[]; top_k?: number },
    signal?: AbortSignal,
  ): Promise<ApiChatResponse> {
    return request<ApiChatResponse>("/chat/query", {
      method: "POST",
      token,
      body: payload,
      signal,
    });
  },

  /**
   * GET /documents/search — AI insight + related documents for the search bar.
   */
  searchDocuments(
    token: string,
    query: string,
    opts?: { top_k?: number; signal?: AbortSignal },
  ): Promise<ApiSearchResponse> {
    const params = new URLSearchParams({ query });
    if (opts?.top_k != null) params.set("top_k", String(opts.top_k));
    return request<ApiSearchResponse>(`/documents/search?${params.toString()}`, {
      token,
      signal: opts?.signal,
    });
  },

  // ── Health ───────────────────────────────────────────────────────────
  health(signal?: AbortSignal): Promise<{ status: string; env: string }> {
    const base = getBaseUrl().replace(/\/api\/v1$/, "");
    return fetch(`${base}/health`, { signal, cache: "no-store" }).then((r) => {
      if (!r.ok) throw new ApiError("Backend health check failed", r.status);
      return r.json();
    });
  },
};
