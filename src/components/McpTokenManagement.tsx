"use client";

import { useState, useTransition } from "react";
import { mintMcpToken, revokeMcpToken } from "@/lib/actions/mcp-tokens";

type TokenRow = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  user: { id: string; name: string | null; email: string; role: string };
};

type UserOption = { id: string; name: string | null; email: string; role: string };

export function McpTokenManagement({ tokens, users, mcpUrl }: { tokens: TokenRow[]; users: UserOption[]; mcpUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<{ token: string; user: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mint = () => {
    setError(null);
    setMinted(null);
    const user = users.find((u) => u.id === userId);
    startTransition(async () => {
      try {
        const { token } = await mintMcpToken(userId, label);
        setMinted({ token, user: user?.name ?? user?.email ?? "user" });
        setLabel("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to mint token");
      }
    });
  };

  const copySnippet = async () => {
    if (!minted) return;
    await navigator.clipboard.writeText(minted.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={pending}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {(u.name ?? u.email) + " — " + u.role}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Label, e.g. Aira — Claude Desktop"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={pending}
          style={{ minWidth: 240 }}
        />
        <button className="btn" onClick={mint} disabled={pending || !userId}>
          {pending ? "Minting…" : "Mint token"}
        </button>
      </div>

      {error && <p className="small" style={{ color: "var(--danger, #c00)" }}>{error}</p>}

      {minted && (
        <div className="card" style={{ padding: 12, marginBottom: 16, border: "1px solid var(--accent, #2a7)", borderRadius: 8 }}>
          <p className="small" style={{ marginTop: 0 }}>
            Token for <strong>{minted.user}</strong> — copy it now, it will <strong>not be shown again</strong>:
          </p>
          <code style={{ display: "block", wordBreak: "break-all", padding: 8, background: "var(--surface-2, #f4f4f4)", borderRadius: 6 }}>
            {minted.token}
          </code>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" onClick={copySnippet}>{copied ? "Copied ✓" : "Copy token"}</button>
            <span className="small">
              Connect with header <code>Authorization: Bearer &lt;token&gt;</code> at <code>{mcpUrl}</code>
            </span>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Label</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tokens.length === 0 && (
            <tr>
              <td colSpan={6} className="small">No tokens minted yet.</td>
            </tr>
          )}
          {tokens.map((t) => (
            <tr key={t.id} style={t.revokedAt ? { opacity: 0.5 } : undefined}>
              <td>{t.user.name ?? t.user.email}<span className="small" style={{ marginLeft: 6 }}>({t.user.role})</span></td>
              <td>{t.label ?? "—"}</td>
              <td className="small">{t.createdAt.slice(0, 10)}</td>
              <td className="small">{t.lastUsedAt ? t.lastUsedAt.slice(0, 16).replace("T", " ") : "never"}</td>
              <td className="small">{t.revokedAt ? "revoked" : "active"}</td>
              <td>
                {!t.revokedAt && (
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() => startTransition(() => revokeMcpToken(t.id))}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
