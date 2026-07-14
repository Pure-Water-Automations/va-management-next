"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/Avatar";
import { putToR2 } from "@/lib/upload-client";
import { daysInMonth } from "@/lib/birthdays";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Curated list covering the team's usual regions; free-text isn't worth the typos.
const TIMEZONES = [
  "Asia/Manila",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
];

export function ProfileForm({
  defaults,
}: {
  defaults: {
    name: string;
    photoSrc?: string | null;
    bio?: string | null;
    location?: string | null;
    timezone?: string | null;
    birthdayMonth?: number | null;
    birthdayDay?: number | null;
  };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(defaults.bio ?? "");
  const [location, setLocation] = useState(defaults.location ?? "");
  const [timezone, setTimezone] = useState(defaults.timezone ?? "");
  const [month, setMonth] = useState(defaults.birthdayMonth ? String(defaults.birthdayMonth) : "");
  const [day, setDay] = useState(defaults.birthdayDay ? String(defaults.birthdayDay) : "");
  const [photoSrc, setPhotoSrc] = useState(defaults.photoSrc ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const presign = await postAction("/api/va/profile/photo", { contentType: file.type });
      if (!presign.ok) throw new Error(presign.error ?? "Could not start the upload");
      const { uploadUrl } = presign.result as { uploadUrl: string };
      await putToR2(uploadUrl, file, file.type);
      const fin = await postAction("/api/va/profile/photo/finalize", {});
      if (!fin.ok) throw new Error(fin.error ?? "Could not save the photo");
      const { vaId } = fin.result as { vaId: string };
      setPhotoSrc(`/api/people/photo/${vaId}?v=${Date.now()}`);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if ((month === "") !== (day === "")) {
      window.alert("Pick both a birthday month and day (or leave both blank).");
      return;
    }
    setSaving(true);
    const res = await postAction("/api/va/profile", {
      bio,
      location,
      timezone,
      birthdayMonth: month ? Number(month) : undefined,
      birthdayDay: day ? Number(day) : undefined,
    });
    setSaving(false);
    if (!res.ok) {
      window.alert(res.error ?? "Save failed");
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
  const label: React.CSSProperties = { fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", fontWeight: 700 };
  const input: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "10px 12px", font: "inherit", background: "var(--color-surface)" };

  const maxDay = month ? daysInMonth(Number(month)) : 31;

  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <Avatar name={defaults.name} size={72} src={photoSrc} />
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileRef.current?.click()} loading={uploading} disabled={uploading} variant="secondary">
            {photoSrc ? "Change photo" : "Upload photo"}
          </Button>
          <div className="small" style={{ marginTop: 6 }}>JPEG, PNG, or WebP.</div>
        </div>
      </div>

      <div style={field}>
        <label style={label}>About me</label>
        <textarea
          style={{ ...input, minHeight: 90 }}
          value={bio}
          maxLength={1000}
          placeholder="A few lines about you — hobbies, family, fun facts…"
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <div style={field}>
        <label style={label}>Location</label>
        <input style={input} value={location} placeholder="e.g. Cebu, Philippines" onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div style={field}>
        <label style={label}>Timezone</label>
        <select style={input} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="">— not set —</option>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div style={field}>
        <label style={label}>Birthday</label>
        <div className="small" style={{ marginBottom: 2 }}>
          Month and day only — we never store the year. Used for team birthday shout-outs. 🎂
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            style={{ ...input, flex: 2 }}
            value={month}
            aria-label="Birthday month"
            onChange={(e) => {
              setMonth(e.target.value);
              const m = Number(e.target.value);
              if (e.target.value && day && Number(day) > daysInMonth(m)) setDay("");
            }}
          >
            <option value="">Month…</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select style={{ ...input, flex: 1 }} value={day} aria-label="Birthday day" onChange={(e) => setDay(e.target.value)}>
            <option value="">Day…</option>
            {Array.from({ length: maxDay }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button onClick={save} loading={saving} disabled={saving} variant="primary">Save profile</Button>
        {savedAt ? <span className="small" style={{ color: "var(--color-success-dark)" }}>Saved ✓</span> : null}
      </div>
    </div>
  );
}
