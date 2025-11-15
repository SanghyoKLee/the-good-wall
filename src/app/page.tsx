"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SLIDE_MS = 9000;
const REFRESH_MIN = 5;

type Media = {
  type: "image" | "video";
  url: string;
};

type ApiResp = {
  user: string;
  count: number;
  media: Media[];
  error?: string;
};

export default function InstaSlideshow() {
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const hasLoadedOnce = useRef(false);

  const queryUser = useMemo(() => {
    if (typeof window === "undefined") return "";
    return (
      new URLSearchParams(window.location.search).get("user")?.trim() || ""
    );
  }, []);

  async function load() {
    try {
      // Only show loading overlay on first load, not on refreshes
      if (!hasLoadedOnce.current) {
        setLoading(true);
      }
      setError(null);
      const url = queryUser
        ? `/api/instagram/scrape?user=${encodeURIComponent(queryUser)}`
        : `/api/instagram/scrape`;
      const res = await fetch(url, { cache: "no-store" });
      const data: ApiResp = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || `HTTP ${res.status}`);

      // Wrap Instagram URLs through our proxy to avoid CORS issues
      const proxiedMedia = (data.media || []).map((item) => ({
        type: item.type,
        url: `/api/instagram/proxy?url=${encodeURIComponent(item.url)}`,
      }));

      console.log(
        `Loaded ${proxiedMedia.length} media items:`,
        proxiedMedia.map((m) => ({
          type: m.type,
          url: m.url.slice(0, 100),
        }))
      );

      setMediaItems(proxiedMedia);
      setUsername(data.user || queryUser);
      // Don't reset to 0 if we already have media - keep showing current position
      if (!hasLoadedOnce.current) {
        setIdx(0);
        hasLoadedOnce.current = true;
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || "Failed to fetch media");
      } else {
        setError("Failed to fetch media");
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
    if (!mediaItems.length) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(
      () => setIdx((i) => (i + 1) % mediaItems.length),
      SLIDE_MS
    ) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [mediaItems]);

  useEffect(() => {
    if (!mediaItems.length) return;
    const nextItem = mediaItems[(idx + 1) % mediaItems.length];
    // Preload next item if it's an image
    if (nextItem?.type === "image") {
      const next = new Image();
      next.src = nextItem.url;
    }
  }, [idx, mediaItems]);

  const currentMedia = mediaItems[idx];

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
      {mediaItems.length > 0 && currentMedia && (
        <>
          {currentMedia.type === "image" ? (
            <img
              key={currentMedia.url}
              src={currentMedia.url}
              alt={`@${username} tagged post`}
              style={{
                maxWidth: "100vw",
                maxHeight: "100vh",
                objectFit: "contain",
                position: "absolute",
                inset: 0,
                margin: "auto",
              }}
              onError={() => setIdx((i) => (i + 1) % mediaItems.length)}
            />
          ) : (
            <video
              key={currentMedia.url}
              src={currentMedia.url}
              autoPlay
              loop
              muted
              playsInline
              style={{
                maxWidth: "100vw",
                maxHeight: "100vh",
                objectFit: "contain",
                position: "absolute",
                inset: 0,
                margin: "auto",
              }}
              onError={(e) => {
                console.error("Video error:", currentMedia.url, e);
                setIdx((i) => (i + 1) % mediaItems.length);
              }}
              onLoadedData={() =>
                console.log("Video loaded:", currentMedia.url)
              }
              onLoadStart={() =>
                console.log("Video loading:", currentMedia.url)
              }
            />
          )}
        </>
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
        <div style={{ fontWeight: 600, fontSize: 27 }}>
          Tag <span style={{ color: "#58a6ff" }}>@hello.innogoods</span> to be
          featured!
        </div>
        {mediaItems.length > 0 && (
          <div style={{ opacity: 0.5 }}>
            {idx + 1} / {mediaItems.length}
          </div>
        )}
      </div>

      {(loading || error || mediaItems.length === 0) && (
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
                ? "Loading tagged media…"
                : error || "No media found yet."}
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
