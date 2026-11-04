"""Temporary: check which feeds GitHub's servers can read for pages being added."""
import asyncio, json
from pathlib import Path
import scraper
from playwright.async_api import async_playwright

PROBES = [
    "https://snfpaideia.upenn.edu/feed/",
    "https://snfpaideia.upenn.edu/category/blog/feed/",
    "https://snfpaideia.upenn.edu/?cat=1&feed=rss2",
    "https://snfpaideia.upenn.edu/engage/perspectives/feed/",
    "https://snfpaideia.upenn.edu/wp-json/wp/v2/posts?per_page=20&_fields=id,date,link,title,categories",
    "https://snfpaideia.upenn.edu/wp-json/wp/v2/news?per_page=5&_fields=id,date,link,title",
    "https://www.annenbergpublicpolicycenter.org/tag/press-releases/feed/",
    "https://www.annenbergpublicpolicycenter.org/appc-general-news/feed/",
    "https://www.asc.upenn.edu/rss.xml",
]

def summarize(text):
    if not text:
        return {"len": 0}
    info = {"len": len(text), "head": text[:160]}
    if scraper.is_feed(text):
        arts = scraper.parse_feed(text)
        info["feed_items"] = len(arts)
        info["first"] = [(a["date"], a["title"][:80], a["link"]) for a in arts[:6]]
    else:
        try:
            data = json.loads(text)
            if isinstance(data, list):
                info["json_items"] = len(data)
                info["first"] = [(d.get("date"), (d.get("title") or {}).get("rendered", "")[:80], d.get("link"), d.get("categories")) for d in data[:8]]
        except Exception:
            pass
    return info

async def main():
    out = Path("html_dumps"); out.mkdir(exist_ok=True)
    report = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=scraper.RETRY_ARGS)
        ua = await scraper.browser_user_agent(browser)
        ctx = await browser.new_context(user_agent=ua, locale="en-US")
        page = await ctx.new_page()
        for url in PROBES:
            row = {}
            try:
                text = await asyncio.get_running_loop().run_in_executor(None, scraper._urllib_get, url, 15, ua)
                row["urllib"] = summarize(text)
            except Exception as e:
                row["urllib"] = {"error": str(e)[:200]}
            try:
                r = await ctx.request.get(url, timeout=20000, headers={"User-Agent": ua})
                row["browser"] = dict(status=r.status, ctype=r.headers.get("content-type"), **summarize(await r.text()))
            except Exception as e:
                row["browser"] = {"error": str(e)[:200]}
            report[url] = row
            print(url, "| urllib:", row["urllib"].get("feed_items", row["urllib"].get("json_items", row["urllib"].get("error", row["urllib"].get("len")))),
                  "| browser:", row["browser"].get("status"), row["browser"].get("feed_items", row["browser"].get("json_items", row["browser"].get("error", ""))))
        await browser.close()
    (out / "probe.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))

asyncio.run(main())
