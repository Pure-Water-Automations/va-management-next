"use client";

import { useCallback, useRef, useState } from "react";

type Person = { id: string; name: string | null; email: string };

/**
 * A textarea with @mention autocomplete. Detects an "@token" under the caret,
 * fetches matching people from /api/people, and inserts "@Full Name " on select.
 * Controlled like a normal textarea (value + onChange) so callers keep their
 * own submit logic. The post-save resolver (notifyMentions) turns the inserted
 * name into an in-app notification for that person.
 */
export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const tokenRef = useRef<{ atIndex: number; caret: number } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPeople([]);
    tokenRef.current = null;
  }, []);

  const detect = useCallback(
    (v: string, caret: number) => {
      const before = v.slice(0, caret);
      // An "@" at start or after whitespace, then up to 20 non-@/newline chars (names may contain spaces).
      const m = before.match(/(?:^|\s)@([^@\n]{0,20})$/);
      if (!m) {
        closeMenu();
        return;
      }
      const query = m[1];
      tokenRef.current = { atIndex: caret - query.length - 1, caret };
      fetch(`/api/people?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((d) => {
          const list: Person[] = (d.people ?? []).filter((p: Person) => p.name);
          setPeople(list);
          setActive(0);
          setOpen(list.length > 0);
        })
        .catch(() => closeMenu());
    },
    [closeMenu],
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    detect(v, e.target.selectionStart ?? v.length);
  }

  function pick(p: Person) {
    const tok = tokenRef.current;
    const el = ref.current;
    if (!tok || !el || !p.name) {
      closeMenu();
      return;
    }
    const next = value.slice(0, tok.atIndex) + "@" + p.name + " " + value.slice(tok.caret);
    onChange(next);
    closeMenu();
    const pos = tok.atIndex + 1 + p.name.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || people.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % people.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + people.length) % people.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(people[active]);
    } else if (e.key === "Escape") {
      closeMenu();
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(closeMenu, 150)}
        placeholder={placeholder}
        rows={rows}
        style={style}
      />
      {open && people.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 30,
            left: 8,
            right: 8,
            bottom: "100%",
            marginBottom: 4,
            listStyle: "none",
            padding: 4,
            margin: 0,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-input)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {people.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: i === active ? "var(--color-bg-secondary, #eef2ff)" : "transparent",
                  font: "inherit",
                  fontSize: "var(--text-sm)",
                }}
              >
                <strong>{p.name}</strong>{" "}
                <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-xs)" }}>
                  {p.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
