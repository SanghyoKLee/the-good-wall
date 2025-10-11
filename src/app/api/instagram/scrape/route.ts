// app/api/instagram/scrape/route.ts
export const runtime = "nodejs";
export const maxDuration = 20; // Vercel limit for this fn
export const preferredRegion = "iad1"; // pick a close region
export const dynamic = "force-dynamic"; // avoid any static optimization

import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";

chromium.setGraphicsMode = false;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getPuppeteer() {
  if (process.env.VERCEL) {
    const p = await import("puppeteer-core");
    return p.default ?? p;
  }
  const p = await import("puppeteer");
  return p.default ?? p;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user = (searchParams.get("user") || "hello.innogoods")
    .replace("@", "")
    .trim();
  const maxImages = Number(searchParams.get("max") || 20);
  const debug = searchParams.get("debug") === "1";
  const diag = searchParams.get("diag") === "1";

  if (!user) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  // prefer cookie set via /api/instagram/session; fallback to env var
  const cookieSession = req.cookies.get("IG_SESSIONID")?.value;
  const IG_SESSIONID = cookieSession || process.env.IG_SESSIONID || "";

  const url = `https://www.instagram.com/${encodeURIComponent(user)}/tagged/`;

  const isServerless = !!process.env.VERCEL;

  let stage = "import puppeteer";
  let browser: any;

  try {
    const puppeteer = await getPuppeteer();

    stage = "launch browser";
    const launchOptions = {
      headless: true,
      args: isServerless
        ? await chromium.args
        : ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: isServerless
        ? await chromium.executablePath()
        : undefined,
      defaultViewport: { width: 1280, height: 900 },
    } as const;

    browser = await puppeteer.launch(launchOptions);

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
    await page
      .goto(url, { waitUntil: "networkidle2", timeout: 60000 })
      .catch(async () => {
        // fallback if networkidle2 is too strict on serverless
        await page.waitForSelector("body", { timeout: 15000 });
      });

    stage = "dismiss consent";
    await page
      .evaluate(() => {
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
      })
      .catch(() => {});

    stage = "scroll & collect";
    const collected = new Set<string>();
    for (let i = 0; i < 12 && collected.size < maxImages; i++) {
      const batch: string[] = await page.evaluate(() => {
        const urls = new Set<string>();
        document
          .querySelectorAll<HTMLImageElement>(
            "img[src^='https://scontent-'], img[srcset*='scontent-']"
          )
          .forEach((img) => {
            const cands: string[] = [];
            if (img.currentSrc) cands.push(img.currentSrc);
            if (img.src) cands.push(img.src);
            const ss = img.getAttribute("srcset") || "";
            for (const part of ss.split(",")) {
              const u = part.trim().split(" ")[0];
              if (u) cands.push(u);
            }
            for (const u of cands) {
              if (
                /^https:\/\/scontent-/.test(u) &&
                /\.(jpg|jpeg|webp|png)(\?|$)/i.test(u)
              ) {
                urls.add(u);
              }
            }
          });
        return Array.from(urls);
      });

      for (const u of batch) {
        if (collected.size >= maxImages) break;
        collected.add(u);
      }

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(900 + Math.random() * 350);
    }

    const images = Array.from(collected).slice(0, maxImages);

    // Optional inline diagnostics
    if (diag) {
      return NextResponse.json({
        diag: true,
        isServerless,
        execPath: isServerless
          ? await chromium.executablePath()
          : "local-chrome",
        hasCookie: Boolean(IG_SESSIONID),
        gotImages: images.length,
        stageReached: stage,
        url,
      });
    }

    return NextResponse.json({ user, count: images.length, images });
  } catch (e: any) {
    // Log stage + error to Vercel function logs
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
