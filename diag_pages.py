"""Temporary: save what GitHub's servers see on pages being added or fixed."""
import asyncio, json
from pathlib import Path
import scraper
from playwright.async_api import async_playwright

TARGETS = {   # name: (url, rules id to test with)
    "annenberg": ("https://www.asc.upenn.edu/news-events/news", "annenberg"),
    "appc-press": ("https://www.annenbergpublicpolicycenter.org/tag/press-releases/", "appc"),
    "snf-perspectives": ("https://snfpaideia.upenn.edu/engage/perspectives/", "snf-paideia-program"),
}

async def main():
    out = Path("html_dumps"); out.mkdir(exist_ok=True)
    report = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=scraper.RETRY_ARGS)
        ua = await scraper.browser_user_agent(browser)
        for name, (url, rid) in TARGETS.items():
            ctx = await browser.new_context(user_agent=ua, locale="en-US", timezone_id="America/New_York",
                                            viewport={"width": 1366, "height": 900},
                                            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"})
            page = await ctx.new_page()
            calls, bodies = [], []
            async def keep(r, name=name):
                if r.request.resource_type in ("xhr", "fetch", "document"):
                    calls.append(f"{r.status} {r.request.resource_type} {r.request.method} {r.url[:240]}")
                    if r.request.resource_type in ("xhr", "fetch") and "json" in (r.headers.get("content-type") or ""):
                        try:
                            bodies.append({"url": r.url, "body": (await r.text())[:200000]})
                        except Exception:
                            pass
            page.on("response", lambda r: asyncio.ensure_future(keep(r)))
            info = {"url": url}
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                info["status"] = resp.status if resp else None
                raw = await resp.text() if resp else ""
                (out / f"{name}.raw.html").write_text(raw)
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                for _ in range(4):
                    await page.evaluate("window.scrollBy(0, document.body.scrollHeight * 0.6)")
                    await page.wait_for_timeout(1500)
                html = await page.content()
                (out / f"{name}.html").write_text(html)
                info["raw_len"], info["rendered_len"] = len(raw), len(html)
                info["found"] = await page.evaluate(scraper.EXTRACT_JS, scraper.rule_args(rid))
            except Exception as e:
                info["error"] = str(e)[:300]
            await page.wait_for_timeout(500)
            info["requests"] = calls[:80]
            (out / f"{name}.xhr.json").write_text(json.dumps(bodies, indent=1)[:2000000])
            report[name] = info
            await ctx.close()
        await browser.close()
    (out / "report.json").write_text(json.dumps(report, indent=2))
    for k, v in report.items():
        print(k, v.get("status"), v.get("raw_len"), v.get("rendered_len"), len(v.get("found") or []), v.get("error", ""))

asyncio.run(main())
