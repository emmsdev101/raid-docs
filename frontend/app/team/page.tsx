"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/Card";
import { RoleBadge } from "../components/Badges";
import { useAuth } from "../lib/auth-context";
import {
  api,
  ApiError,
  type ApiOrganization,
  type ApiUser,
  type Role,
} from "../lib/api";
import { colorFromId, formatDate, initialsFromName } from "../lib/format";

export default function TeamPage() {
  const { token } = useAuth();
  const [members, setMembers] = useState<ApiUser[]>([]);
  const [org, setOrg] = useState<ApiOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    Promise.all([
      api.listTeamMembers(token, controller.signal),
      api.getOrganization(token, controller.signal),
    ])
      .then(([users, organization]) => {
        if (controller.signal.aborted) return;
        setMembers(users);
        setOrg(organization);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Failed to load team");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token]);

  const roleCounts = members.reduce(
    (acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    },
    { ADMIN: 0, MEMBER: 0, VIEWER: 0 } as Record<Role, number>,
  );

  return (
    <div>
      <PageHeader
        title="Team & Access"
        description="Manage members of your organization. Access is scoped by role — Admins can manage settings and audits, Members can upload and query, Viewers have read-only access."
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        {/* Org info */}
        {loading ? (
          <Card>
            <div className="p-6 text-sm text-muted">Loading workspace…</div>
          </Card>
        ) : org ? (
          <Card>
            <div className="flex items-center gap-4 p-6">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold">{org.name}</div>
                <div className="text-xs text-muted mt-0.5">
                  {org.domain ? (
                    <>
                      Domain{" "}
                      <span className="font-mono">{org.domain}</span> ·{" "}
                    </>
                  ) : null}
                  Created {formatDate(org.created_at)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="text-[10px] text-muted uppercase tracking-wider">
                  Members
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {org.member_count}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Role stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(
            [
              {
                role: "ADMIN" as const,
                desc: "Full access to settings, audits, and data.",
              },
              {
                role: "MEMBER" as const,
                desc: "Can upload, run audits, and search.",
              },
              {
                role: "VIEWER" as const,
                desc: "Read-only access to documents and search.",
              },
            ]
          ).map((r) => (
            <div
              key={r.role}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <RoleBadge role={r.role} />
                <span className="text-2xl font-semibold tabular-nums">
                  {loading ? "—" : roleCounts[r.role]}
                </span>
              </div>
              <p className="text-xs text-muted">{r.desc}</p>
            </div>
          ))}
        </div>

        {/* Members table */}
        <Card>
          <CardHeader
            title="Members"
            description={
              loading
                ? "Loading…"
                : `${members.length} ${members.length === 1 ? "person has" : "people have"} access to ${org?.name ?? "this workspace"}`
            }
          />
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              Loading members…
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              No members yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted bg-surface-2/50">
                  <th className="px-5 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium hidden sm:table-cell">
                    Role
                  </th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((user) => {
                  const displayName = user.name?.trim() || user.email;
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                            style={{ backgroundColor: colorFromId(user.id) }}
                          >
                            {initialsFromName(user.name, user.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {displayName}
                            </div>
                            <div className="text-xs text-muted truncate">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
