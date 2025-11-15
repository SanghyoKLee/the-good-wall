import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (
    !imageUrl ||
    !(
      imageUrl.startsWith("https://scontent-") ||
      imageUrl.startsWith("https://instagram.") ||
      imageUrl.startsWith("https://scontent.cdninstagram.com")
    )
  ) {
    return NextResponse.json(
      { error: "Invalid or missing media URL" },
      { status: 400 }
    );
  }

  try {
    // Get range header if present (for video streaming)
    const range = req.headers.get("range");

    // Fetch the media from Instagram's CDN with proper headers
    const fetchHeaders: HeadersInit = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.instagram.com/",
    };

    // Add range header if present (important for video streaming)
    if (range) {
      fetchHeaders["Range"] = range;
    }

    const response = await fetch(imageUrl, {
      headers: fetchHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }

    // Get the media data
    const mediaBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    const contentLength = response.headers.get("Content-Length");
    const contentRange = response.headers.get("Content-Range");
    const acceptRanges = response.headers.get("Accept-Ranges");

    // Determine cache duration based on content type
    const isVideo = contentType.startsWith("video/");
    const cacheHeader = isVideo
      ? "public, max-age=7200, s-maxage=14400" // Videos: 2-4 hours
      : "public, max-age=3600, s-maxage=7200"; // Images: 1-2 hours

    // Build response headers
    const responseHeaders: HeadersInit = {
      "Content-Type": contentType,
      "Cache-Control": cacheHeader,
      "Access-Control-Allow-Origin": "*", // Allow CORS
    };

    // Add video-specific headers
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    // Return the media with proper headers
    return new NextResponse(mediaBuffer, {
      status: response.status, // Use original status (200 or 206 for partial content)
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[proxy] Failed to fetch media:", error);
    return NextResponse.json(
      { error: error.message || "Failed to proxy media" },
      { status: 500 }
    );
  }
}
