#!/usr/bin/env python3
"""Collect older stories for one configured source into a searchable JSON archive.

This is a bounded, best-effort crawl of the source's own listing pages. It does
not claim that every publisher exposes its full history through pagination.
"""
import argparse
import asyncio
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urldefrag, urlunparse

from scraper import (BROWSER_ARGS, EXTRACT_JS, SITE_RULES, browser_user_agent,
                     extract_jsonld_articles, finalize_raw, load_sites, loadable,
                     merge_articles, rule_args, try_feed)

ROOT = Path(__file__).parent
NEXT_JS = """() => {
  const links = [...document.querySelectorAll('a[href]')];
  const specific = links.find(a => a.rel.split(/\\s+/).includes('next') ||
    a.matches('.pager__item--next a, a.pager__item--next, .pagination-next, a.next, .next a, li.next a, a[aria-label*=Next], a[title*=Next]') ||
    /^(next|older(?: posts| stories| articles)?|next page)\\s*[›»→]?$|^[›»→]$/i.test(a.textContent.trim()));
  if (specific) return specific.href;
  const current = document.querySelector('[aria-current="page"], .pagination .active, .pager .is-active');
  if (current) {
    const page = Number(current.textContent.trim());
    const candidates = links.filter(a => a.closest('.pagination, .pager, nav[aria-label*=agin]'));
    const following = candidates.find(a => Number(a.textContent.trim()) === page + 1);
    if (following) return following.href;
  }
  return null;
}"""


def next_url(current, candidate):
    """Follow only HTTP(S) pagination on the original source host."""
    if not candidate:
        return None
    url = urldefrag(urljoin(current, candidate))[0]
    old, new = urlparse(current), urlparse(url)
    if new.scheme not in ('http', 'https') or new.hostname != old.hostname:
        return None
    return url


def increment_page_url(current):
    """Continue a numbered query listing even when its theme hides the next link."""
    parsed = urlparse(current)
    query = parse_qs(parsed.query, keep_blank_values=True)
    key = next((k for k in ('page', 'paged') if k in query and len(query[k]) == 1), None)
    if not key or not query[key][0].isdigit():
        return None
    query[key] = [str(int(query[key][0]) + 1)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def ajax_pagination_url(candidate):
    """WordPress AJAX page links need their listing's JavaScript click handler."""
    return bool(candidate and urlparse(candidate).path.endswith('/wp-admin/admin-ajax.php'))


def merge_archive(site, discovered, existing, latest, metadata):
    """Keep earlier discoveries, but never mix archives after a source URL edit."""
    pages = [site['newsUrl']] + list(site.get('extraUrls') or [])
    prior = existing.get('posts', []) if existing.get('listingUrls') == pages else []
    live = latest.get('posts', []) if latest.get('newsUrl') == site['newsUrl'] and (latest.get('extraUrls') or []) == (site.get('extraUrls') or []) else []
    posts = merge_articles(discovered + prior + live)
    return {'schemaVersion': 1, 'id': site['id'], 'name': site['name'],
            'listingUrls': pages, 'lastScrapedAt': datetime.now(timezone.utc).isoformat(),
            'pagesScanned': metadata['pagesScanned'], 'stopReasons': metadata['stopReasons'],
            'warnings': metadata['warnings'], 'requestedFrom': metadata['requestedFrom'],
            'oldestCaptured': min((p['date'] for p in posts), default=''),
            'newestCaptured': max((p['date'] for p in posts), default=''),
            'posts': posts}


async def scrape_listing(browser, site, listing, earliest, max_pages, ua):
    rules = SITE_RULES.get(site['id'], {})
    ctx = await browser.new_context(user_agent=ua, locale='en-US', timezone_id='America/New_York',
                                    viewport={'width': 1366, 'height': 900})
    page = await ctx.new_page()
    seen, found, warnings = set(), [], []
    target, navigate = listing, True
    count, reason = 0, 'no next-page link found'
    try:
        for _ in range(max_pages):
            try:
                if navigate:
                    if target in seen:
                        reason = 'repeated page'; break
                    seen.add(target)
                    response = await page.goto(loadable(target), wait_until='domcontentloaded', timeout=30000)
                    if not response or response.status >= 400:
                        raise RuntimeError(f'HTTP {response.status if response else "no response"}')
                try: await page.wait_for_load_state('networkidle', timeout=6000)
                except Exception: pass
                if rules.get('wait_for'):
                    try: await page.wait_for_selector(rules['wait_for'], timeout=7000)
                    except Exception: pass
                for _ in range(min(max(rules.get('scrolls', 3), 3), 8)):
                    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    await page.wait_for_timeout(700)
                raw = await page.evaluate(EXTRACT_JS, rule_args(site['id']))
                html = await page.content()
                articles = merge_articles(finalize_raw(raw) + extract_jsonld_articles(html, target))
                previous = {a['link'] for a in found}
                new_articles = [a for a in articles if a['link'] not in previous]
                count += 1
                found.extend(new_articles)
                candidate = next_url(target, await page.evaluate(NEXT_JS))
                if not articles:
                    warnings.append(f'No dated stories extracted from page {count}: {target}')
                    reason = 'no stories on next page' if count > 1 else 'no dated stories'; break
                if not new_articles and count > 1:
                    reason = 'no new stories on next page'; break
                if candidate in seen:
                    reason = 'repeated page'; break
                # Page listings are ordinarily newest first. Stop only after an
                # entire nonempty page is older than the requested boundary.
                if earliest and new_articles and max(a['date'] for a in new_articles) < earliest:
                    reason = 'reached requested date'; break
                if ajax_pagination_url(candidate):
                    before = await page.evaluate('() => [...document.querySelectorAll("a[href]")].map(a => a.href).join("|")')
                    pager = page.locator('a.next[href], a[rel="next"][href], a.pagination-next[href]').first
                    if not await pager.count():
                        warnings.append(f'AJAX pagination link has no clickable next control: {target}')
                        reason = 'AJAX pagination stopped'; break
                    await pager.click(timeout=5000)
                    try:
                        await page.wait_for_function('(old) => [...document.querySelectorAll("a[href]")].map(a => a.href).join("|") !== old', arg=before, timeout=12000)
                        navigate = False
                        continue
                    except Exception:
                        warnings.append(f'AJAX next page did not load new links: {target}')
                        reason = 'AJAX pagination stopped'; break
                if candidate:
                    target, navigate = candidate, True
                    continue
                # Some publishers append another batch to the same document.
                # Re-read it, retaining only links that were not in earlier batches.
                more = page.get_by_role('button', name=re.compile(r'^(load|show|view) more(?: stories| news| articles)?$', re.I)).first
                if await more.count() and await more.is_visible():
                    before = await page.locator('a[href]').count()
                    await more.click(timeout=5000)
                    try:
                        await page.wait_for_function('(n) => document.querySelectorAll("a[href]").length > n', arg=before, timeout=12000)
                        navigate = False
                        continue
                    except Exception:
                        warnings.append(f'Load More did not reveal new links on {target}')
                        reason = 'load more stopped'; break
                candidate = increment_page_url(target)
                if candidate:
                    target, navigate = candidate, True
                    continue
                reason = 'no next-page link found'; break
            except Exception as exc:
                warnings.append(f'Page {count + 1} failed: {str(exc).splitlines()[0][:160]}')
                reason = 'page failed'; break
        else:
            reason = f'{max_pages}-page limit reached'
    finally:
        await ctx.close()
    return found, count, reason, warnings


async def run(args):
    from playwright.async_api import async_playwright
    sites = {s['id']: s for s in load_sites()}
    if args.site not in sites:
        raise ValueError('Choose a source ID from sites.js')
    site = sites[args.site]
    if args.from_date:
        bound = date.fromisoformat(args.from_date)
        if bound > date.today():
            raise ValueError('Earliest date cannot be in the future')
    urls = [site.get('newsUrl')] + list(site.get('extraUrls') or [])
    urls = [u for u in urls if u]
    if not urls and site.get('feedUrl'):
        urls = [site['feedUrl']]
    if not urls:
        raise ValueError('This source has no news or feed URL')
    discovered, reasons, warnings, pages = [], [], [], 0
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=BROWSER_ARGS)
        ua = await browser_user_agent(browser)
        for listing in urls:
            if listing == site.get('feedUrl') and not site.get('newsUrl'):
                context = await browser.new_context(user_agent=ua)
                page = await context.new_page()
                try:
                    items = await try_feed(page, listing, 15, ua)
                    discovered.extend(items)
                    reasons.append(f'{listing}: feed returned {len(items)} items; older pages may exist')
                    pages += 1
                finally: await context.close()
            else:
                items, n, reason, issues = await scrape_listing(browser, site, listing, args.from_date, args.max_pages, ua)
                discovered.extend(items); pages += n; warnings.extend(issues)
                reasons.append(f'{listing}: {reason}')
        await browser.close()
    if pages == 0:
        details = '; '.join(warnings[:3]) or 'No listing page could be read'
        raise RuntimeError(f'Archive scan could not read this source; existing archive left unchanged. {details}')
    path = ROOT / 'public' / 'data' / 'archive' / f"{site['id']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = json.loads(path.read_text()) if path.exists() else {}
    snapshot = ROOT / 'public' / 'data' / 'latest.json'
    latest = {}
    if snapshot.exists():
        latest = next((s for s in json.loads(snapshot.read_text()).get('sites', []) if s['id'] == site['id']), {})
    result = merge_archive(site, discovered, existing, latest,
                           {'pagesScanned': pages, 'stopReasons': reasons, 'warnings': warnings,
                            'requestedFrom': args.from_date or ''})
    if not result['posts']:
        raise RuntimeError('No articles found; leaving any published archive unchanged')
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"{site['name']}: {len(discovered)} discovered on {pages} page(s); {len(result['posts'])} saved → {path}")
    for message in reasons + warnings: print(' - ' + message)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', required=True, help='ID from sites.js')
    parser.add_argument('--from-date', default='', help='earliest desired date, YYYY-MM-DD')
    parser.add_argument('--max-pages', type=int, default=25, choices=(10, 25, 50))
    asyncio.run(run(parser.parse_args()))
