"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SLIDE_MS = 6000;
const REFRESH_MIN = 5;

type ApiResp = {
  user: string;
  count: number;
  images: string[];
  error?: string;
};

export default function InstaSlideshow() {
  const [images, setImages] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const queryUser = useMemo(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("user")?.trim() || ""
    );
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const url = queryUser
        ? `/api/instagram/scrape?user=${encodeURIComponent(queryUser)}`
        : `/api/instagram/scrape`;
      const res = await fetch(url, { cache: "no-store" });
      const data: ApiResp = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || `HTTP ${res.status}`);
      setImages(data.images || []);
      setUsername(data.user || queryUser);
      setIdx(0);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || "Failed to fetch images");
      } else {
        setError("Failed to fetch images");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MIN * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryUser]);

  useEffect(() => {
    if (!images.length) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(
      () => setIdx((i) => (i + 1) % images.length),
      SLIDE_MS
    ) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [images]);

  useEffect(() => {
    if (!images.length) return;
    const next = new Image();
    next.src = images[(idx + 1) % images.length];
  }, [idx, images]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        color: "white",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {images.length > 0 && (
        <img
          key={images[idx]}
          src={images[idx]} // direct scontent URL
          alt={`@${username} tagged post`}
          style={{
            maxWidth: "100vw",
            maxHeight: "100vh",
            objectFit: "contain",
            position: "absolute",
            inset: 0,
            margin: "auto",
          }}
          onError={() => setIdx((i) => (i + 1) % images.length)}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          padding: "12px 18px",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 25 }}>
          Tag <span style={{ color: "#58a6ff" }}>@hello.innogoods</span> to be
          featured!
        </div>
        {images.length > 0 && (
          <div style={{ opacity: 0.8 }}>
            {idx + 1} / {images.length}
          </div>
        )}
      </div>

      {(loading || error || images.length === 0) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 18, marginBottom: 8 }}>
              {loading
                ? "Loading tagged photos…"
                : error || "No photos found yet."}
            </div>
            {!loading && (
              <div style={{ fontSize: 14, opacity: 0.7 }}>
                Make sure your Instagram “Tagged” tab is visible. If it’s
                private, set IG_SESSIONID.
              </div>
            )}
          </div>
        </div>
      )}
      <a
        href="/setup"
        title="Open Instagram Slideshow Setup"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          textDecoration: "none",
          background: "rgba(0,0,0,0.35)",
          padding: "6px 8px",
          borderRadius: 6,
          backdropFilter: "blur(2px)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color = "white";
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(0,0,0,0.55)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color =
            "rgba(255,255,255,0.7)";
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(0,0,0,0.35)";
        }}
      >
        Setup
      </a>
    </div>
  );
}
