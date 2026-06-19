"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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

export default function ClientRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/client/requests/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRequest(data.request);
    } else {
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
    setPosting(false);
  }

  if (loadError)
    return <div style={{ padding: 24, color: "#dc2626" }}>{loadError}</div>;
  if (!request)
    return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Loading…</div>;

  const comments = request.assignedTask?.comments ?? [];

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/client/requests" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        ← Requests
      </Link>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "12px 0 4px" }}>{request.title}</h1>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginBottom: 20,
          display: "flex",
          gap: 16,
        }}
      >
        <span>
          Status: <strong>{request.status}</strong>
        </span>
        <span>Priority: {request.priorityPreference}</span>
        {request.dueDatePreference && (
          <span>
            Preferred by: {new Date(request.dueDatePreference).toLocaleDateString()}
          </span>
        )}
      </div>

      <div
        style={{
          padding: 14,
          background: "var(--surface-secondary, #f9f9f9)",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{request.description}</p>
      </div>

      {request.status === "DECLINED" && request.declineReason && (
        <div
          style={{
            padding: 12,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <strong style={{ fontSize: 13 }}>Declined:</strong>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>{request.declineReason}</p>
        </div>
      )}

      {request.assignedTask && (
        <div style={{ marginBottom: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          Linked task: <strong>{request.assignedTask.title}</strong> ·{" "}
          {request.assignedTask.status}
          {request.assignedTask.assignedTo?.name &&
            ` · ${request.assignedTask.assignedTo.name}`}
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Updates</h2>
      {comments.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No updates yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {comments.map((c) => (
          <div
            key={c.id}
            style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              {c.author.name} · {new Date(c.createdAt).toLocaleString()}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>{c.body}</div>
          </div>
        ))}
      </div>

      {request.assignedTask && (
        <form
          onSubmit={postComment}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <textarea
            placeholder="Add a reply…"
            rows={3}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
              resize: "vertical",
            }}
          />
          {commentError && (
            <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{commentError}</p>
          )}
          <button
            type="submit"
            disabled={posting || !newComment.trim()}
            style={{
              alignSelf: "flex-start",
              padding: "8px 20px",
              background: "var(--accent, #0066cc)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: posting ? "not-allowed" : "pointer",
            }}
          >
            {posting ? "Posting…" : "Reply"}
          </button>
        </form>
      )}
    </div>
  );
}
