"use client";

import { useState } from "react";

export default function InstaSetup() {
  const [sessionId, setSessionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState("hello.innogoods");
  const [testResult, setTestResult] = useState<string | null>(null);

  async function saveSessionId(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/instagram/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, maxAgeDays: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage("Saved. (Cookie set for this browser/session host.)");
      setSessionId("");
    } catch (err: any) {
      setMessage(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function testScrape() {
    setTestResult("Testing…");
    try {
      const res = await fetch(
        `/api/instagram/scrape?user=${encodeURIComponent(user)}&debug=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || `HTTP ${res.status}`);
      setTestResult(
        `OK: found ${data.count} image(s). Sample: ${JSON.stringify(
          data.sample || []
        )}`
      );
    } catch (e: any) {
      setTestResult(e.message || "Test failed.");
    }
  }

  async function clearSession() {
    setTestResult(null);
    setMessage(null);
    await fetch("/api/instagram/session", { method: "DELETE" });
    setMessage("Cleared saved session.");
  }

  const slideshowHref = `/?user=${encodeURIComponent(user)}`;

  function openHere() {
    window.location.href = slideshowHref;
  }

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "40px auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Instagram Slideshow Setup
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Paste the <code>sessionid</code> cookie from a browser logged into your
        Instagram account. This will be stored as a secure HttpOnly cookie and
        used by the scraper.
      </p>

      <form onSubmit={saveSessionId} style={{ display: "grid", gap: 12 }}>
        <label>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            Instagram sessionid
          </div>
          <input
            type="password"
            placeholder="Paste sessionid cookie value"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontFamily: "inherit",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={saving || !sessionId}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#111827",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          type="button"
          onClick={clearSession}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
          }}
        >
          Clear Saved Session
        </button>

        {message && <div style={{ paddingTop: 4 }}>{message}</div>}
      </form>

      <hr style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gap: 8 }}>
        <label>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            Instagram username to test
          </div>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="yourbrand"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
        </label>
        <button
          type="button"
          onClick={testScrape}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Save & Test
        </button>
        {testResult && (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#f6f8fa",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            {testResult}
          </pre>
        )}
      </div>

      <hr style={{ margin: "20px 0" }} />
      <p>
        When it works, open the slideshow page in fullscreen on your TV
        computer:
      </p>

      {/* New buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <a
          href={slideshowHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#10b981",
            color: "white",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Open Slideshow (New Tab)
        </a>

        <button
          type="button"
          onClick={openHere}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#0ea5e9",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open Slideshow Here
        </button>
      </div>

      <p style={{ marginTop: 10 }}>
        Link:&nbsp;
        <code
          style={{ background: "#f6f8fa", padding: "2px 6px", borderRadius: 6 }}
        >
          {slideshowHref}
        </code>
      </p>
    </div>
  );
}
