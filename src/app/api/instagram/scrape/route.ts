export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

const DEFAULT_IG_USER = process.env.IG_USER || "hello.innogoods";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function uniq<T>(arr: T[]) {
  const s = new Set<T>();
  const out: T[] = [];
  for (const x of arr)
    if (!s.has(x)) {
      s.add(x);
      out.push(x);
    }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams, pathname } = new URL(req.url);
  const user = (searchParams.get("user") || DEFAULT_IG_USER)
    .replace("@", "")
    .trim();
  const debug = searchParams.get("debug") === "1";
  const maxImages = Number(searchParams.get("max") || 35);
  if (!user)
    return NextResponse.json({ error: "Missing username" }, { status: 400 });

  // 1) Prefer cookie set via /api/instagram/session; fallback to env var
  const cookieSession = req.cookies.get("IG_SESSIONID")?.value;
  const IG_SESSIONID = cookieSession || process.env.IG_SESSIONID || "";

  const url = `https://www.instagram.com/${encodeURIComponent(user)}/tagged/`;

  let browser: import("puppeteer").Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 900 },
    });

    const page = await browser.newPage();
    await page.setUserAgent(UA);

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

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    try {
      await page.evaluate(() => {
        const clickByText = (regexes: RegExp[]) => {
          const btns = Array.from(
            document.querySelectorAll<HTMLButtonElement>("button")
          );
          for (const b of btns) {
            const t = (b.textContent || "").trim();
            for (const re of regexes)
              if (re.test(t)) {
                b.click();
                return true;
              }
          }
          const links = Array.from(
            document.querySelectorAll<HTMLAnchorElement>("a")
          );
          for (const a of links) {
            const t = (a.textContent || "").trim();
            for (const re of regexes)
              if (re.test(t)) {
                a.click();
                return true;
              }
          }
          return false;
        };
        clickByText([
          /allow all cookies/i,
          /allow all/i,
          /accept all/i,
          /accept/i,
          /agree/i,
          /ok/i,
        ]);
      });
    } catch {}

    // Scroll & collect only real scontent images
    const collected = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const batch: string[] = await page.evaluate(() => {
        const urls = new Set<string>();
        document
          .querySelectorAll<HTMLImageElement>(
            "img[src^='https://scontent-'], img[srcset*='scontent-']"
          )
          .forEach((img) => {
            const candidates: string[] = [];
            if (img.currentSrc) candidates.push(img.currentSrc);
            if (img.src) candidates.push(img.src);
            const srcset = img.getAttribute("srcset") || "";
            if (srcset) {
              for (const part of srcset.split(",")) {
                const u = part.trim().split(" ")[0];
                if (u) candidates.push(u);
              }
            }
            for (const u of candidates) {
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

      batch.forEach((u) => collected.add(u));
      if (collected.size >= maxImages) break;

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(1100 + Math.random() * 400);
    }

    const images = uniq(Array.from(collected)).slice(0, maxImages);

    if (debug) {
      return NextResponse.json({
        user,
        count: images.length,
        sample: images.slice(0, 5),
        hint: IG_SESSIONID
          ? "Using saved session cookie"
          : "No session cookie detected (public only)",
      });
    }

    return NextResponse.json({ user, count: images.length, images });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
