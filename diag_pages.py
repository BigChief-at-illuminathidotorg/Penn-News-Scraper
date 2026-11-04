"""Temporary: save what GitHub's servers see on GSE news and the McNeil Center news page."""
import asyncio, json
from pathlib import Path
import scraper
from playwright.async_api import async_playwright

TARGETS = {
    "gse": "https://www.gse.upenn.edu/news-and-events/news",
    "mcneil-center-for-early-american-studies": "https://www.mceas.org/news",
}
COUNT_JS = """() => {
  const items = document.querySelectorAll('.news_list_item, .views-row, article').length;
  const more = [...document.querySelectorAll('a,button')].filter(e => /load more|show more|more news|more stories|view more|next/i.test(e.textContent.trim()) && e.textContent.trim().length < 30)
               .map(e => `${e.tagName} ${e.textContent.trim()} ${e.getAttribute('href') || ''} ${e.className}`).slice(0, 8);
  const pager = [...document.querySelectorAll('a[href*="page="], .pager a, nav[aria-label*=agination] a')].map(a => a.getAttribute('href')).slice(0, 10);
  return {items, height: document.body.scrollHeight, more, pager};
}"""

async def main():
    out = Path("html_dumps"); out.mkdir(exist_ok=True)
    report = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=scraper.RETRY_ARGS)
        ua = await scraper.browser_user_agent(browser)
        for sid, url in TARGETS.items():
            ctx = await browser.new_context(user_agent=ua, locale="en-US", timezone_id="America/New_York",
                                            viewport={"width": 1366, "height": 900},
                                            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"})
            page = await ctx.new_page()
            calls = []
            page.on("request", lambda r: calls.append(f"{r.resource_type} {r.method} {r.url[:220]}") if r.resource_type in ("xhr", "fetch", "document") else None)
            info = {"url": url, "steps": []}
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=40000)
                info["status"] = resp.status if resp else None
                (out / f"{sid}.raw.html").write_text(await resp.text() if resp else "")
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                for i in range(12):
                    found = await page.evaluate(scraper.EXTRACT_JS, scraper.rule_args(sid))
                    c = await page.evaluate(COUNT_JS)
                    dates = sorted(f["dateText"][:10] for f in found)
                    info["steps"].append({"scroll": i, "found": len(found), "first": dates[-1] if dates else None,
                                          "last": dates[0] if dates else None, **c})
                    print(sid, i, len(found), c["items"], c["height"], dates[-1:] , dates[:1])
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1800)
                (out / f"{sid}.html").write_text(await page.content())
                info["found"] = await page.evaluate(scraper.EXTRACT_JS, scraper.rule_args(sid))
            except Exception as e:
                info["error"] = str(e)[:300]
            info["requests"] = calls[:120]
            report[sid] = info
            await ctx.close()
        # what the feeds say
        ctx = await browser.new_context(user_agent=ua)
        page = await ctx.new_page()
        for f in ("https://www.mceas.org/feed/", "https://www.mceas.org/rss.xml", "https://www.gse.upenn.edu/rss.xml", "https://www.gse.upenn.edu/feed/"):
            text = await scraper.fetch_feed_text(page, f, 12, ua)
            arts = scraper.read_feed(text) if text else []
            report[f] = [(a["date"], a["title"][:80], a["link"]) for a in arts[:8]]
            print(f, len(arts))
        await browser.close()
    (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))

asyncio.run(main())
