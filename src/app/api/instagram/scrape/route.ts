// app/api/instagram/scrape/route.ts
export const runtime = "nodejs";
export const maxDuration = 60; // Increase to 60 seconds for Vercel
export const preferredRegion = "iad1";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import path from "path";

(chromium as any).setBrotliPath?.(
  path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin")
);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = (searchParams.get("user") || "hello.innogoods")
    .replace("@", "")
    .trim();
  const maxMedia = Number(searchParams.get("max") || 12);
  const diag = searchParams.get("diag") === "1";
  if (!user)
    return NextResponse.json({ error: "Missing username" }, { status: 400 });

  const cookieSession = req.cookies.get("IG_SESSIONID")?.value;
  const IG_SESSIONID = cookieSession || process.env.IG_SESSIONID || "";
  const url = `https://www.instagram.com/${encodeURIComponent(user)}/tagged/`;
  const isServerless = !!process.env.VERCEL;

  let stage = "import puppeteer";
  let browser: any;

  try {
    const puppeteer = await (isServerless
      ? import("puppeteer-core").then((m) => m.default ?? m)
      : import("puppeteer").then((m) => m.default ?? m));

    stage = "launch browser";
    let launchOptions: any; // or a proper LaunchOptions type if you prefer

    if (process.env.VERCEL) {
      launchOptions = {
        args: chromium.args, // <- no await
        executablePath: await chromium.executablePath(),
        headless: true,
        defaultViewport: { width: 1280, height: 900 },
      };
    } else {
      launchOptions = {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"], // <- mutable array
        defaultViewport: { width: 1280, height: 900 },
      };
    }

    const browser = await puppeteer.launch(launchOptions);
    stage = "new page";
    const page = await browser.newPage();

    stage = "set UA";
    await page.setUserAgent(UA);

    stage = "set cookie";
    if (IG_SESSIONID) {
      await page.setCookie({
        name: "sessionid",
        value: IG_SESSIONID,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
    }

    stage = "goto";
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded", // Faster than networkidle0
        timeout: 30000,
      });
      // Shorter wait for serverless
      await sleep(isServerless ? 800 : 1500);
    } catch (navError) {
      console.warn("[scrape] Navigation warning:", navError);
      // If navigation fails, wait for body as fallback
      try {
        await page.waitForSelector("body", { timeout: 10000 });
        await sleep(1000);
      } catch {
        throw new Error("Page failed to load");
      }
    }

    stage = "dismiss consent";
    await sleep(1000);
    try {
      await page.evaluate(() => {
        const clickByText = (res: RegExp[]) => {
          for (const el of Array.from(document.querySelectorAll("button,a"))) {
            const t = (el.textContent || "").trim();
            if (res.some((r) => r.test(t))) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        };
        clickByText([
          /allow all cookies/i,
          /accept all/i,
          /accept/i,
          /agree/i,
          /ok/i,
        ]);
      });
      await sleep(1000);
    } catch (consentError) {
      console.warn("[scrape] Consent dialog handling skipped:", consentError);
    }

    stage = "scroll & collect";
    const collected: Array<{ type: "image" | "video"; url: string }> = [];
    const postLinks: Array<{ url: string; isVideo: boolean }> = [];

    // Check if we're actually on the tagged page
    const currentUrl = await page.url();

    // Wait for content to load
    await sleep(800);

    // First, collect post links from the tagged grid
    // We need to find only posts that are IN the grid, not just any post link on the page
    // Reduce iterations for serverless environment
    const scrollIterations = isServerless ? 3 : 6;
    for (let i = 0; i < scrollIterations && postLinks.length < maxMedia; i++) {
      const links = await page.evaluate(() => {
        const urls: { url: string; isVideo: boolean }[] = [];

        // Instagram's tagged grid is usually in <article> tags or specific grid containers
        // Look for the grid structure specifically
        const gridContainers = document.querySelectorAll("article, main");

        gridContainers.forEach((container) => {
          // Find links that have an image child - these are the actual grid posts
          // Look for both /p/ (posts) and /reel/ (reels/videos)
          const gridLinks = container.querySelectorAll(
            'a[href*="/p/"], a[href*="/reel/"]'
          );
          gridLinks.forEach((link) => {
            // Only count it if it has an image child (actual grid item)
            const hasImage = link.querySelector("img");
            if (hasImage) {
              const href = link.getAttribute("href") || "";
              if (/\/(p|reel)\/[A-Za-z0-9_-]+\/?/.test(href)) {
                const fullUrl = href.startsWith("http")
                  ? href
                  : `https://www.instagram.com${href}`;
                const normalized = fullUrl.endsWith("/")
                  ? fullUrl
                  : fullUrl + "/";

                // Check if this is a reel (video) based on URL
                const isReel = href.includes("/reel/");

                // Also check for video icon indicators in the grid
                const parent = link.closest("div");
                const hasVideoIcon = parent?.querySelector(
                  'svg[aria-label*="video" i], svg[aria-label*="clip" i], [aria-label*="reel" i]'
                );
                const hasPlayIcon =
                  parent &&
                  Array.from(parent.querySelectorAll("svg")).some((svg) => {
                    const label = svg.getAttribute("aria-label") || "";
                    return /video|clip|reel/i.test(label);
                  });

                urls.push({
                  url: normalized,
                  isVideo: isReel || Boolean(hasVideoIcon || hasPlayIcon),
                });
              }
            }
          });
        });

        return urls;
      });

      for (const link of links) {
        if (postLinks.length >= maxMedia) break;
        if (!postLinks.some((p) => p.url === link.url)) {
          postLinks.push(link);
        }
      }

      if (postLinks.length >= maxMedia) break;

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(800);
    }

    console.log(`[scrape] Found ${postLinks.length} tagged posts`);

    // If we didn't find any posts, the tagged section might be private or empty
    if (postLinks.length === 0) {
      console.warn(
        "[scrape] No posts found in tagged section - may be private or empty"
      );
    }

    // Now visit each post to extract media
    for (let i = 0; i < Math.min(postLinks.length, maxMedia); i++) {
      if (collected.length >= maxMedia) break;

      console.log(`[scrape] Processing post ${i + 1}/${postLinks.length}`);

      const postLink = postLinks[i];
      const postUrl = postLink.url;
      const expectedVideo = postLink.isVideo;

      let interceptedVideoUrl: string | null = null;

      try {
        // For videos/reels, intercept network requests to capture the actual video URL
        if (expectedVideo) {
          const client = await page.createCDPSession();
          await client.send("Network.enable");

          client.on("Network.responseReceived", (params: any) => {
            // Only capture the first video URL we find
            if (interceptedVideoUrl) return;

            const url = params.response.url;
            // Instagram video URLs are typically from scontent CDN and are .mp4
            if (url.includes("scontent") && url.includes(".mp4")) {
              // Remove bytestart/byteend parameters - we want the full video
              const cleanUrl =
                url.split("?")[0] +
                "?" +
                url
                  .split("?")[1]
                  ?.split("&")
                  .filter(
                    (p: string) =>
                      !p.startsWith("bytestart=") && !p.startsWith("byteend=")
                  )
                  .join("&");

              interceptedVideoUrl = cleanUrl;
            }
          });
        }

        await page.goto(postUrl, {
          waitUntil: "domcontentloaded", // Faster than networkidle0
          timeout: 15000,
        });

        // Shorter wait times for serverless
        await sleep(isServerless ? 500 : 800);

        // Only wait for video element if we expect a video (saves 3-5s on image posts!)
        if (expectedVideo) {
          try {
            await page.waitForSelector("video", {
              timeout: isServerless ? 2000 : 3000,
            });
            await sleep(isServerless ? 300 : 500); // Wait for src to load
          } catch (videoWaitErr) {
            // No video element appeared
          }
        }

        // Try to scroll to trigger video loading (only if video expected)
        if (expectedVideo) {
          await page.evaluate(() => window.scrollBy(0, 200));
          await sleep(300);
        }

        const media = await page.evaluate(() => {
          // First check for video (try multiple selectors)
          let video = document.querySelector(
            "article video[src]"
          ) as HTMLVideoElement;
          if (!video) {
            video = document.querySelector(
              "main video[src]"
            ) as HTMLVideoElement;
          }
          if (!video) {
            // Try finding ANY video element and wait for src to load
            const allVideos = document.querySelectorAll(
              "video"
            ) as NodeListOf<HTMLVideoElement>;
            for (const v of allVideos) {
              if (v.src) {
                video = v;
                break;
              }
            }
          }

          if (video?.src) {
            return { type: "video" as const, url: video.src };
          }

          // If no video element found, check meta tags for video URL
          const metaVideo = document
            .querySelector('meta[property="og:video"]')
            ?.getAttribute("content");
          const metaVideoSecure = document
            .querySelector('meta[property="og:video:secure_url"]')
            ?.getAttribute("content");
          if (metaVideoSecure || metaVideo) {
            return {
              type: "video" as const,
              url: metaVideoSecure || metaVideo || "",
            };
          }

          // Look for image - try multiple selectors
          let img = document.querySelector(
            'article img[src*="scontent"]'
          ) as HTMLImageElement;
          if (!img) {
            img = document.querySelector(
              'main img[src*="scontent"]'
            ) as HTMLImageElement;
          }
          if (!img) {
            // Last resort: find the largest scontent image
            const allImages = Array.from(
              document.querySelectorAll('img[src*="scontent"]')
            ) as HTMLImageElement[];
            if (allImages.length > 0) {
              img = allImages[0];
            }
          }

          if (img) {
            // Get the largest image from srcset
            const srcset = img.getAttribute("srcset") || "";
            if (srcset) {
              const parts = srcset.split(",").map((part) => {
                const [url, desc] = part.trim().split(/\s+/);
                const width = desc ? parseInt(desc) : 0;
                return { url, width };
              });
              parts.sort((a, b) => b.width - a.width);
              if (parts[0]?.url) {
                return { type: "image" as const, url: parts[0].url };
              }
            }

            // Fallback to src
            if (img.src && img.src.includes("scontent")) {
              return { type: "image" as const, url: img.src };
            }
          }
          return { type: null, url: null };
        });

        if (media && media.type) {
          // If we intercepted a video URL and this is a reel, ALWAYS use the intercepted URL
          if (expectedVideo && interceptedVideoUrl) {
            collected.push({ type: "video", url: interceptedVideoUrl });
            console.log(`[scrape] ✓ Video ${collected.length}/${maxMedia}`);
          } else if (media.type === "video" && media.url.startsWith("blob:")) {
            // Skip blob URLs - we can't use them
            console.log(`[scrape] ✗ Skipped blob video`);
          } else {
            // For images, filter out thumbnails
            if (
              media.type === "image" &&
              /\/(s150x150|s320x320|s240x240)/.test(media.url)
            ) {
              console.log(`[scrape] ✗ Skipped thumbnail`);
              continue;
            }

            collected.push({ type: media.type, url: media.url });
            console.log(
              `[scrape] ✓ ${media.type === "image" ? "Image" : "Video"} ${
                collected.length
              }/${maxMedia}`
            );
          }
        } else if (expectedVideo && interceptedVideoUrl) {
          // We expected a video and intercepted one, even though DOM parsing failed
          collected.push({ type: "video", url: interceptedVideoUrl });
          console.log(
            `[scrape] ✓ Video ${collected.length}/${maxMedia} (intercepted)`
          );
        }
      } catch (postError) {
        console.warn(`[scrape] Failed to load post ${i + 1}:`, postError);
        continue;
      }
    }

    const media = collected.slice(0, maxMedia);

    console.log(`[scrape] Completed: ${media.length} media items collected`);

    if (diag) {
      return NextResponse.json({
        diag: true,
        isServerless,
        execPath: isServerless
          ? await chromium.executablePath()
          : "local-chrome",
        hasCookie: Boolean(IG_SESSIONID),
        gotMedia: media.length,
        stageReached: stage,
        url,
      });
    }

    return NextResponse.json({ user, count: media.length, media });
  } catch (e: any) {
    console.error("[/api/instagram/scrape] FAILED at stage:", stage, e);
    return NextResponse.json(
      { error: `Failed at stage "${stage}": ${String(e?.message || e)}` },
      { status: 500 }
    );
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
}
