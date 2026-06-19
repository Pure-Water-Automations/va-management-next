"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill, PriorityPill } from "@/components/StatusPill";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string | null };
};

type RequestDetail = {
  id: string;
  title: string;
  description: string;
  status: string;
  priorityPreference: string;
  dueDatePreference: string | null;
  declineReason: string | null;
  createdAt: string;
  submittedBy: { name: string | null; email: string };
  assignedTask: {
    id: string;
    title: string;
    status: string;
    assignedTo: { name: string | null };
    comments: Comment[];
  } | null;
};

const backLink: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-tertiary)",
  fontWeight: "var(--weight-medium)",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-lg)",
  fontWeight: "var(--weight-semibold)",
  color: "var(--color-text-primary)",
  margin: "0 0 var(--space-3)",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-primary)",
  background: "var(--color-surface)",
  resize: "vertical",
};

export default function ClientRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/client/requests/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRequest(data.request);
      } else {
        setLoadError("Failed to load request. Please refresh.");
      }
    } catch {
      setLoadError("Failed to load request. Please refresh.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setPosting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/client/requests/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        await load();
      } else {
        setCommentError("Failed to post comment. Please try again.");
      }
    } catch {
      setCommentError("Failed to post comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  if (loadError)
    return (
      <Card padding="var(--space-6)">
        <p style={{ margin: 0, color: "var(--color-error)" }}>{loadError}</p>
      </Card>
    );
  if (!request)
    return (
      <p style={{ color: "var(--color-text-tertiary)" }}>Loading…</p>
    );

  const comments = request.assignedTask?.comments ?? [];

  return (
    <div>
      <Link href="/client/requests" style={backLink}>
        ← Requests
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-3) 0 var(--space-2)" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          {request.title}
        </h1>
        <StatusPill status={request.status} size="md" />
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
          marginBottom: "var(--space-5)",
        }}
      >
        <PriorityPill priority={request.priorityPreference} />
        {request.dueDatePreference && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            Preferred by {new Date(request.dueDatePreference).toLocaleDateString()}
          </span>
        )}
      </div>

      <Card variant="flat" padding="var(--space-5)" style={{ marginBottom: "var(--space-6)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)", color: "var(--color-text-primary)" }}>
          {request.description}
        </p>
      </Card>

      {request.status === "DECLINED" && request.declineReason && (
        <Card
          padding="var(--space-4)"
          style={{
            marginBottom: "var(--space-6)",
            background: "var(--color-error-light)",
            border: "1px solid rgba(240,76,76,0.22)",
          }}
        >
          <strong style={{ fontSize: "var(--text-sm)", color: "var(--color-error-dark)" }}>Declined</strong>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
            {request.declineReason}
          </p>
        </Card>
      )}

      {request.assignedTask && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span>Linked task:</span>
          <strong style={{ color: "var(--color-text-primary)" }}>{request.assignedTask.title}</strong>
          <StatusPill status={request.assignedTask.status} />
          {request.assignedTask.assignedTo?.name && (
            <span style={{ color: "var(--color-text-tertiary)" }}>· {request.assignedTask.assignedTo.name}</span>
          )}
        </div>
      )}

      <h2 style={h2}>Updates</h2>
      {comments.length === 0 && (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>No updates yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
        {comments.map((c) => (
          <Card key={c.id} padding="var(--space-4)">
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-1)" }}>
              {c.author.name} · {new Date(c.createdAt).toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)", color: "var(--color-text-primary)" }}>
              {c.body}
            </div>
          </Card>
        ))}
      </div>

      {request.assignedTask && (
        <form onSubmit={postComment} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <textarea
            placeholder="Add a reply…"
            rows={3}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            style={input}
          />
          {commentError && (
            <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)", margin: 0 }}>{commentError}</p>
          )}
          <Button type="submit" size="sm" loading={posting} disabled={posting || !newComment.trim()} style={{ alignSelf: "flex-start" }}>
            {posting ? "Posting…" : "Reply"}
          </Button>
        </form>
      )}
    </div>
  );
}
