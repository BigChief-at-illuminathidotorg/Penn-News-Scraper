#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "playwright>=1.44",
#   "rich>=13",
# ]
# ///
"""
Penn News Monitor — local scraper (v3, clean rebuild)

For every site in sites.js, tries these in order and stops at the first that
yields articles:

  1. feed      explicit feedUrl, then a feed discovered from <link rel=alternate>,
               then a few common feed paths
  2. jsonld    schema.org NewsArticle / ItemList data embedded in the page
  3. html      rendered-DOM extraction (EXTRACT_JS below), guided by SITE_RULES

All network access goes through the Playwright browser (Penn's firewall blocks
plain urllib for many sites); urllib is only used as a cheap first try for feeds.

HOW TO RUN
  First time only:
    curl -LsSf https://astral.sh/uv/install.sh | sh     # install uv, restart Terminal
    uv run scraper.py --install-browser                 # install Chromium
  Every time after:
    uv run scraper.py
  Output: penn-news-scraped-<today>.json  (import it with the dashboard's Import button)

OPTIONS
  --site ID          scrape one site            --list             show the site table
  --concurrency N    parallel pages (default 4) --timeout N        page timeout, seconds (25)
  --out FILE         output filename            --dump-html        save rendered HTML of every
  --install-browser  install Chromium                              site that reaches stage 3 to
                                                                   html_dumps/<id>.html
If a site comes back empty, run it with --site ID --dump-html and send the dump;
the fix is usually one line in SITE_RULES.
"""

import argparse, asyncio, json, re, sys, urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
MAX_PER_SITE = 20
TODAY_SENTINEL = "__TODAY__"

# ══ sites.js ═══════════════════════════════════════════════════════════════════
def load_sites():
    path = Path(__file__).parent / "sites.js"
    if not path.exists():
        sys.exit(f"ERROR: sites.js not found next to scraper.py ({path})")
    raw = path.read_text(encoding="utf-8")
    pos = raw.find("window.PENN_MONITOR_DEFAULT_SITES")
    if pos == -1:
        sys.exit("ERROR: PENN_MONITOR_DEFAULT_SITES not found in sites.js")
    start = raw.index("[", pos)
    depth = 0
    for i in range(start, len(raw)):
        depth += (raw[i] == "[") - (raw[i] == "]")
        if depth == 0:
            try:
                return json.loads(raw[start:i + 1])
            except json.JSONDecodeError as e:
                sys.exit(f"ERROR parsing sites.js: {e}")
    sys.exit("ERROR: unbalanced brackets in sites.js")

# ══ Dates ══════════════════════════════════════════════════════════════════════
MONTHS = {m: i for i, m in enumerate(
    "jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}

def _month(name):
    return MONTHS.get(name.lower().rstrip(".")[:3])

# (regex, builder(groups) -> (y, m, d)).  Order matters: most specific first.
_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})(?!\d)"),
        lambda g: (int(g[0]), int(g[1]), int(g[2]))),
    (re.compile(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b"),
        lambda g: (int(g[2]), _month(g[0]), int(g[1]))),
    (re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b"),
        lambda g: (int(g[2]), _month(g[1]), int(g[0]))),
    (re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b"),          # US M/D/YYYY, MM.DD.YYYY
        lambda g: (int(g[2]), int(g[0]), int(g[1])) if int(g[0]) <= 12
                  else (int(g[2]), int(g[1]), int(g[0]))),           # …or D.M.YYYY if first > 12
    (re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{2})\b"),                # M/D/YY
        lambda g: (2000 + int(g[2]), int(g[0]), int(g[1]))),
    (re.compile(r"\b([A-Za-z]{3,9})\.?\s+(\d{4})\b"),               # "May 2026" -> the 1st
        lambda g: (int(g[1]), _month(g[0]), 1)),
]

def _first_date(text):
    for pat, build in _DATE_PATTERNS:
        for m in pat.finditer(text):
            try:
                y, mo, d = build(m.groups())
            except (ValueError, TypeError):
                continue
            if mo and 1 <= mo <= 12 and 1 <= d <= 31 and 2010 <= y <= date.today().year + 1:
                return f"{y:04d}-{mo:02d}-{d:02d}"
    return None

def parse_date(text):
    """Any date-ish string -> 'YYYY-MM-DD' or None. Handles ISO datetimes, RFC-822
    feed dates, 'Month D, YYYY', 'D Month YYYY', M/D/YYYY, MM.DD.YYYY, M/D/YY, and
    strings with a category fused on the front ('Research 9 Jun 2026')."""
    if not text:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    # Fused category+date with no separator, e.g. "...CohenMay 5, 2026"
    text = re.sub(r"([a-z])((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d)", r"\1 \2", text)
    return _first_date(text)

# ══ Feeds ══════════════════════════════════════════════════════════════════════
ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/elements/1.1/}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"

def strip_tags(html):
    if not html:
        return ""
    t = re.sub(r"<[^>]+>", " ", html)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", " "),
                 ("&#8217;", "'"), ("&#8216;", "'"), ("&#8220;", '"'), ("&#8221;", '"'),
                 ("&quot;", '"'), ("&#039;", "'")):
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip()

def _first(el, *tags):
    """First child matching any tag.  NB: never `a.find(x) or a.find(y)` —
    ElementTree elements with no children are falsy, which silently drops every
    plain-text <pubDate>/<title>."""
    for t in tags:
        found = el.find(t)
        if found is not None:
            return found
    return None

def _text(el):
    return (el.text or "").strip() if el is not None else ""

def is_feed(text):
    return bool(text) and any(m in text[:3000] for m in ("<rss", "<feed", "<channel", "<rdf:RDF"))

def parse_feed(xml_text):
    try:
        root = ET.fromstring(xml_text.lstrip("﻿ \n\r\t"))
    except ET.ParseError:
        return []
    out = []
    if root.tag == ATOM + "feed":
        for e in root.findall(ATOM + "entry"):
            link = ""
            for l in e.findall(ATOM + "link"):
                if l.get("rel", "alternate") == "alternate" and l.get("href"):
                    link = l.get("href"); break
            d = parse_date(_text(_first(e, ATOM + "published", ATOM + "updated")))
            out.append(_article(_text(e.find(ATOM + "title")), link, d,
                                _text(_first(e, ATOM + "summary", ATOM + "content"))))
    else:
        for it in root.iter("item"):
            d = parse_date(_text(_first(it, "pubDate", DC + "date")))
            out.append(_article(_text(it.find("title")), _text(it.find("link")), d,
                                _text(_first(it, "description", CONTENT + "encoded"))))
    return [a for a in out if a]

def _article(title, link, d, dek):
    title = strip_tags(title)
    if not (title and link and d):
        return None
    return {"title": title, "link": link, "date": d, "dek": strip_tags(dek)[:280]}

def discover_feed_url(html, base_url):
    for m in re.finditer(r"<link\b[^>]*>", html, re.I):
        tag = m.group(0)
        if re.search(r'type=["\']application/(?:rss|atom)\+xml', tag, re.I):
            h = re.search(r'href=["\']([^"\']+)', tag, re.I)
            if h:
                return urljoin(base_url, h.group(1).replace("&amp;", "&"))
    return None

COMMON_FEED_PATHS = ["/feed/", "/rss.xml", "/feed/rss/", "/?feed=rss2"]

# ══ JSON-LD ════════════════════════════════════════════════════════════════════
_JSONLD = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
_ARTICLE_TYPES = {"newsarticle", "article", "blogposting", "reportagenewsarticle"}

def _walk_jsonld(node, out):
    if isinstance(node, list):
        for n in node: _walk_jsonld(n, out)
        return
    if not isinstance(node, dict):
        return
    for key in ("@graph", "itemListElement", "item", "mainEntity"):
        if isinstance(node.get(key), (dict, list)):
            _walk_jsonld(node[key], out)
    t = node.get("@type", "")
    types = {x.lower() for x in (t if isinstance(t, list) else [t]) if isinstance(x, str)}
    if types & _ARTICLE_TYPES:
        meop = node.get("mainEntityOfPage")
        link = node.get("url") or (meop.get("@id") if isinstance(meop, dict) else meop) or ""
        out.append((node.get("headline") or node.get("name") or "", link,
                    node.get("datePublished") or node.get("dateCreated") or node.get("dateModified") or "",
                    node.get("description") or ""))

def extract_jsonld_articles(html, base_url):
    raw = []
    for m in _JSONLD.finditer(html):
        try:
            _walk_jsonld(json.loads(m.group(1).strip()), raw)
        except Exception:
            continue
    seen, out = set(), []
    for title, link, ds, desc in raw:
        a = _article(str(title), urljoin(base_url, str(link)) if link else "", parse_date(ds), str(desc))
        if a and a["link"] not in seen:
            seen.add(a["link"]); out.append(a)
    return out

# ══ Per-site rules ═════════════════════════════════════════════════════════════
# Keys (all optional):
#   containers       CSS selectors for one-article-per-element, tried BEFORE the
#                    generic list (a hint, not exclusive)
#   date             CSS selectors for the date element inside a container
#   url_must_contain substring every article URL must contain
#   date_optional    True -> keep dateless items, stamped with the scrape date
#                    (only for genuinely dateless "featured" widgets)
_VIEWS = {"containers": [".views-row", "article"], "date": [".field--name-created", "time"]}
SITE_RULES = {
    # Drupal Views (SAS centers)
    **{s: _VIEWS for s in (
        "annenberg", "center-for-east-asian-studies",
        "andrea-mitchell-center-for-the-study-of-democracy",
        "christopher-h-browne-center-for-international-politics",
        "center-for-the-study-of-ethnicity-race-immigration", "the-water-center",
        "digital-humanities-price-lab", "dental", "nursing", "penn-sustainability",
        "fels-institute-of-government", "arthur-ross-gallery", "vet")},
    "penn-eii":    {"containers": [".views-row", "article", ".card"],
                    "date": [".field--name-created", "time", ".card-date"]},
    "penn-iur":    {"containers": ["article", ".views-row"], "date": ["time", ".field--name-created"]},
    # LiveWhale homepage widget and Libraries feature cards show no dates at all.
    "law":         {"containers": [".large-block-container", ".sub-block", ".views-row", ".news-item"],
                    "date": [".field--name-created", ".date", "time"], "date_optional": True},
    "penn-libraries": {"containers": [".article-card", ".views-row", "article"],
                       "date": [".field--name-created", "time"], "date_optional": True},
    # WordPress
    **{s: {"containers": ["article", ".post"], "date": ["time", ".entry-date", ".date"]}
       for s in ("appc", "sas-omnia", "perry-world-house", "sp2", "grasp-lab",
                 "snf-paideia-program", "the-lauder-institute",
                 "jerome-fisher-program-in-management-and-technology",
                 "wharton", "knowledge-at-wharton")},
    "kleinman-center-for-energy-policy": {"containers": [".card", "article"], "date": ["time", ".date", "p"]},
    "pennovation-center": {"containers": [".views-row", "article"], "date": ["time"]},   # headline is plain <h2> + "Read More"
    # Sitecore/React: hashed CSS-module classes, date nested in .date-without-time
    "medicine":    {"containers": ["[class*=CardNews_container]", ".news-item", "article"],
                    "date": [".date-without-time", ".pm-date", "time"]},
    # SEAS: no container class; real links are on engineering.upenn.edu (so no
    # url_must_contain). Relies on the byline pass: "Category / Month D, YYYY".
    "seas":        {"containers": ["article", ".story"], "date": ["time", ".date"]},
    "weitzman":    {"containers": ["article", ".story", "[class*=story]"],     # dates are MM.DD.YYYY
                    "date": ["time", ".date", "[class*=date]"]},
    "gse":         {"containers": [".news_list_item", "article", ".views-row"],
                    "date": ["time.news_list_item_date", "time", ".field--name-created"]},
    # Katz/Platt blog: no dates AND stale — deliberately not date_optional.
    **{s: {"containers": ["article.teaser", ".views-row"], "date": [".field--name-created", "time"]}
       for s in ("herbert-d-katz-center-for-advanced-judaic-studies", "platt-house")},
}

# ══ Browser-side extraction ════════════════════════════════════════════════════
# Runs inside the page. Receives {containers, date, urlMust, dateOptional}.
# Pass 1: walk container selectors (site hint first, then generic list).
# Pass 2 (if <3 found): find "Category / Month D, YYYY" bylines, walk up to the
#         nearest headline link.
EXTRACT_JS = r"""
(cfg) => {
  const MIN_LEN = 18;
  const SKIP = /^(read more|learn more|view all|continue reading|see more|more news|next|previous|home|menu|search|subscribe|load more|back to top|share|print|email|all news|all stories|events?|news|directory|about|contact|apply|give|donate|login|register|sign up|faculty|staff|students?|alumni|visit|calendar|jobs?|topics?|filter|reset|podcast|video|report)$/i;
  const READ_MORE = /^(read more|learn more|continue reading|view (more|details)|more)$/i;
  const GENERIC = ["article",".views-row",".node--type-news",".node--view-mode-teaser",".news-item",
                   ".news-card",".news-list-item",".post-item","[class*=news-item]","[class*=views-row]","li"];
  const DATE_DEFAULT = ["time[datetime]","time",".date",".post-date",".field--name-created",
                        ".field--name-field-date",".news-date",".meta-date","[class*=date]"];
  const HEAD_LINK = ["h1 a","h2 a","h3 a","h4 a","h5 a","a.title","a.headline","a[rel=bookmark]",
                     ".entry-title a",".post-title a","a.h1","a.h2","a.h3","a.h4","a.h5",
                     "a:has(> h1)","a:has(> h2)","a:has(> h3)","a:has(> h4)","a:has(> h5)"];
  const HEAD_TAG = ["h1","h2","h3","h4","h5"];
  const MON = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
  const DATE_RE = new RegExp(MON + "\\s+\\d{1,2},?\\s+\\d{4}|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}\\s+" + MON + "\\s+\\d{4}|\\b\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{2,4}\\b", "i");
  const BYLINE_RE = new RegExp("^[A-Za-z][A-Za-z0-9\\s,&+'\\/-]{1,70}\\/\\s*" + MON + "\\s+\\d{1,2},?\\s+\\d{4}$", "i");

  const txt = el => el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  const abs = h => { try { return new URL(h, location.href).href; } catch (e) { return h; } };
  const okTitle = t => t.length >= MIN_LEN && !SKIP.test(t.trim());
  const badHref = h => !h || h.startsWith("#") || /^(javascript|mailto|tel):/i.test(h);
  const looksLikeArticle = href => {
    try {
      const segs = new URL(href).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
      if (segs.length < 2) return false;
      return !/^(news|press|events?|media|about|contact|faculty|staff|research|programs?|people|home|feed|rss)$/i.test(segs[segs.length - 1]);
    } catch (e) { return false; }
  };
  const accept = link => looksLikeArticle(link) && (!cfg.urlMust || link.indexOf(cfg.urlMust) !== -1);

  // An anchor that wraps a heading (<a><h2>Title</h2><small>date</small></a>) is
  // titled by the heading only, not by the date/byline text around it.
  const titleOf = a => { const h = a.querySelector("h1,h2,h3,h4,h5"); return txt(h || a); };
  const headlineLink = node => {
    for (const s of HEAD_LINK) { const a = node.querySelector(s); if (a && okTitle(titleOf(a))) return a; }
    for (const a of node.querySelectorAll("a[href]")) if (okTitle(titleOf(a))) return a;
    return null;
  };
  // Plain-text heading + separate "Read More" anchor (pennovation)
  const decoupled = node => {
    for (const tag of HEAD_TAG) {
      const h = node.querySelector(tag);
      if (h && !h.querySelector("a") && okTitle(txt(h))) {
        const links = Array.from(node.querySelectorAll("a[href]"));
        const a = links.find(l => READ_MORE.test(txt(l).trim())) || (links.length === 1 ? links[0] : null);
        if (a) return { a, title: txt(h) };
      }
    }
    return null;
  };

  const seen = new Set(), out = [];

  // ---- pass 1: containers -------------------------------------------------
  const dateSels = (cfg.date && cfg.date.length) ? cfg.date : DATE_DEFAULT;
  const selectorGroups = [cfg.containers || [], GENERIC].filter(g => g.length);
  outer:
  for (const group of selectorGroups) {
    for (const sel of group) {
      const batch = [];
      for (const node of document.querySelectorAll(sel)) {
        let a = headlineLink(node), title = a ? titleOf(a) : "";
        if (!a) { const d = decoupled(node); if (!d) continue; a = d.a; title = d.title; }
        const href = a.getAttribute("href");
        if (badHref(href)) continue;
        const link = abs(href);
        if (!accept(link) || seen.has(link)) continue;
        let dateText = "";
        for (const ds of dateSels) {
          const el = node.querySelector(ds);
          if (el) { dateText = (el.getAttribute("datetime") || txt(el)).trim(); if (dateText) break; }
        }
        if (!dateText) { const m = txt(node).match(DATE_RE); if (m) dateText = m[0]; }
        if (!dateText) { if (!cfg.dateOptional) continue; dateText = "__TODAY__"; }
        seen.add(link);
        const dek = node.querySelector("p, .field--name-body, .summary, .teaser-text, .dek, .description, .excerpt, .entry-summary");
        batch.push({ title, link, dateText, dek: dek ? txt(dek).slice(0, 280) : "" });
      }
      if (batch.length >= 3) { out.push(...batch); break outer; }
    }
  }

  // ---- pass 2: byline-anchored (SEAS-style themes) ------------------------
  if (out.length < 3) {
    const hits = [];
    for (const el of document.querySelectorAll("body *")) {
      const t = txt(el);
      if (t && t.length <= 90 && BYLINE_RE.test(t)) hits.push(el);
    }
    const hitSet = new Set(hits);
    const deepest = hits.filter(el => !Array.from(el.querySelectorAll("*")).some(k => hitSet.has(k)));
    for (const el of deepest) {
      let node = el, a = null;
      for (let up = 0; up < 6 && !a; up++) {
        node = node.parentElement;
        if (!node || node === document.body) break;
        a = headlineLink(node);
      }
      if (!a) continue;
      const href = a.getAttribute("href");
      if (badHref(href)) continue;
      const link = abs(href);
      if (!accept(link) || seen.has(link)) continue;
      const m = txt(el).match(DATE_RE);
      if (!m) continue;
      seen.add(link);
      const p = node.querySelector("p");
      out.push({ title: titleOf(a), link, dateText: m[0], dek: p ? txt(p).slice(0, 280) : "" });
    }
  }

  // ---- pass 3: date-anchored (cards with no wrapper element) --------------
  // Find stand-alone date elements, climb to the smallest ancestor that holds
  // exactly one date and a headline link.
  if (out.length < 3) {
    const DATE_ONLY = new RegExp("^(?:" + DATE_RE.source + ")$", "i");
    const dateEls = Array.from(document.querySelectorAll("body *")).filter(el => {
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return false;
      const t = txt(el);
      return t && t.length <= 40 && DATE_ONLY.test(t);
    });
    const dset = new Set(dateEls);
    const leafDates = dateEls.filter(el => !Array.from(el.querySelectorAll("*")).some(k => dset.has(k)));
    const count = node => leafDates.filter(d => node.contains(d)).length;
    for (const dEl of leafDates) {
      let node = dEl, a = null;
      for (let up = 0; up < 7; up++) {
        node = node.parentElement;
        if (!node || node === document.body || count(node) !== 1) break;
        a = headlineLink(node);
        if (!a && node.tagName === "A" && okTitle(titleOf(node))) a = node;
        if (a) break;
      }
      if (!a) continue;
      const href = a.getAttribute("href");
      if (badHref(href)) continue;
      const link = abs(href);
      if (!accept(link) || seen.has(link)) continue;
      seen.add(link);
      const p = node.querySelector("p");
      out.push({ title: titleOf(a), link, dateText: (dEl.getAttribute("datetime") || txt(dEl)), dek: p ? txt(p).slice(0, 280) : "" });
    }
  }
  return out;
}
"""

def rule_args(site_id):
    r = SITE_RULES.get(site_id, {})
    return {"containers": r.get("containers", []), "date": r.get("date", []),
            "urlMust": r.get("url_must_contain", ""), "dateOptional": bool(r.get("date_optional"))}

_TITLE_DATE = re.compile(
    r"^\W*(?:[A-Za-z&]+\s+){0,3}(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
    r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})[\s\-–—|:]*", re.I)

def clean_title(t):
    """Drop a leading 'News July 27, 2026 ' style prefix that some themes put
    inside the headline link (penn-iur). Keeps the title if nothing is left."""
    t = re.sub(r"\s+", " ", t).strip()
    cleaned = _TITLE_DATE.sub("", t, count=1).strip()
    return cleaned if len(cleaned) >= 12 else t

def finalize_raw(raw, today=None):
    """Browser results -> article dicts (parse dates, drop undated, dedupe, newest first)."""
    today = today or date.today().isoformat()
    out, seen = [], set()
    for a in raw:
        d = today if a["dateText"] == TODAY_SENTINEL else parse_date(a["dateText"])
        if d and a["link"] not in seen:
            seen.add(a["link"])
            out.append({"title": clean_title(a["title"]), "link": a["link"], "date": d, "dek": a["dek"]})
    return sorted(out, key=lambda x: x["date"], reverse=True)

# ══ Fetching ═══════════════════════════════════════════════════════════════════
_BLOCKED = ("403 forbidden", "access denied", "error 403", "error 404", "page not found",
            "just a moment", "attention required")

def looks_blocked(text):
    return not text or len(text) < 200 or any(m in text[:2000].lower() for m in _BLOCKED)

def _urllib_get(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, */*;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

async def fetch_feed_text(page, url, timeout=10):
    """urllib first (fast); browser network stack if that's blocked or fails."""
    try:
        text = await asyncio.get_running_loop().run_in_executor(None, _urllib_get, url, min(timeout, 12))
        if is_feed(text):
            return text
    except Exception:
        pass
    # context.request shares the browser's TLS/cookies but never navigates the page
    try:
        r = await page.context.request.get(url, timeout=timeout * 1000, headers={"User-Agent": UA})
        if r.ok:
            text = await r.text()
            if is_feed(text):
                return text
    except Exception:
        pass
    return None

async def try_feed(page, url, timeout):
    text = await fetch_feed_text(page, url, timeout)
    arts = parse_feed(text) if text else []
    return sorted(arts, key=lambda a: a["date"], reverse=True)

# ══ Per-site pipeline ══════════════════════════════════════════════════════════
async def scrape_site(browser, site, timeout, dump_dir=None):
    """-> (articles, error, method)"""
    sid, news_url, feed_url = site.get("id", ""), site.get("newsUrl"), site.get("feedUrl")
    ctx = await browser.new_context(user_agent=UA)
    page = await ctx.new_page()
    try:
        # 1a. explicit feed
        if feed_url:
            arts = await try_feed(page, feed_url, 12)
            if arts:
                return arts[:MAX_PER_SITE], None, f"feed:{feed_url}"
        if not news_url:
            return [], "No news URL configured", ""

        # Load the news page once; reuse the raw response for discovery + JSON-LD.
        try:
            resp = await page.goto(news_url, wait_until="domcontentloaded", timeout=timeout * 1000)
        except Exception as e:
            return [], f"Could not load page: {str(e).splitlines()[0][:80]}", ""
        try:
            raw_html = await resp.text() if resp else ""
        except Exception:
            raw_html = ""
        if resp is not None and resp.status >= 400:
            return [], f"HTTP {resp.status} from {news_url}", ""
        if looks_blocked(raw_html):
            return [], f"Page looks blocked or empty ({news_url})", ""

        # 1b. feed advertised in <link rel=alternate>, 1c. common paths
        candidates = []
        found = discover_feed_url(raw_html, news_url)
        if found and found != feed_url:
            candidates.append(found)
        p = urlparse(news_url)
        candidates += [f"{p.scheme}://{p.netloc}{path}" for path in COMMON_FEED_PATHS]
        for c in candidates:
            arts = await try_feed(page, c, 8)
            if arts:
                return arts[:MAX_PER_SITE], None, f"feed:{c}"

        # 2. JSON-LD
        ld = extract_jsonld_articles(raw_html, news_url)
        if len(ld) >= 3:
            return sorted(ld, key=lambda a: a["date"], reverse=True)[:MAX_PER_SITE], None, "jsonld"

        # 3. rendered DOM — let AJAX views settle, scroll, retry
        try:
            await page.wait_for_load_state("networkidle", timeout=9000)
        except Exception:
            pass
        await page.wait_for_timeout(1200)
        args, raw = rule_args(sid), []
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, document.body.scrollHeight * 0.6)")
            await page.wait_for_timeout(900)
            raw = await page.evaluate(EXTRACT_JS, args)
            if len(raw) >= 3:
                break
        if dump_dir:
            try:
                dump_dir.mkdir(parents=True, exist_ok=True)
                (dump_dir / f"{sid}.html").write_text(await page.content(), encoding="utf-8")
            except Exception:
                pass
        arts = finalize_raw(raw)
        return arts[:MAX_PER_SITE], (None if arts else "No articles found after browser scrape"), "html"
    except Exception as e:
        return [], str(e).splitlines()[0][:120] if str(e) else repr(e), ""
    finally:
        await ctx.close()

# ══ Runner ═════════════════════════════════════════════════════════════════════
def build_snapshot(all_sites, results, now):
    monday = date.today() - timedelta(days=date.today().weekday())
    sites_out = []
    for s in all_sites:
        arts, err, method = results.get(s["id"], ([], None, ""))
        notes = s.get("notes", "")
        posts = [dict(a, stream="news", source=method) for a in arts]
        sites_out.append({
            "id": s["id"], "name": s["name"], "parentUnit": s.get("parentUnit", s["name"]),
            "bucket": s.get("bucket", "Unit"), "subhead": s.get("subhead", ""),
            "newsUrl": s.get("newsUrl"), "feedUrl": s.get("feedUrl"),
            "magazineUrl": s.get("magazineUrl"), "notes": notes, "posts": posts,
            "lastError": err or ("" if arts else "No articles found" + (f" — {notes}" if notes else "")),
            "_cache": {"news": {"items": arts, "feedUrl": s.get("feedUrl", ""), "source": method, "fetchedAt": now}},
            "lastSyncAt": now, "lastSource": method if arts else "",
        })
    return {"theme": "light", "query": "", "showOnlyActive": False, "includeMagazine": False,
            "selectedWeekStart": monday.isoformat(), "sites": sites_out,
            "lastRefreshAt": now, "refreshErrors": [], "showAddSite": False}

async def run(args):
    from playwright.async_api import async_playwright
    from rich.console import Console
    from rich.progress import BarColumn, MofNCompleteColumn, Progress, SpinnerColumn, TextColumn
    from rich.table import Table

    console = Console()
    all_sites = load_sites()

    if args.list:
        t = Table(title="Sites from sites.js", show_lines=True)
        for col, w in (("ID", 38), ("Name", 34), ("Feed / News URL", None), ("Notes", 30)):
            t.add_column(col, width=w)
        for s in all_sites:
            url = s.get("feedUrl") or s.get("newsUrl") or "[dim]no URL[/dim]"
            t.add_row(s["id"], s["name"], ("[green]feed[/green] " if s.get("feedUrl") else "[dim]html[/dim] ") + url, s.get("notes", ""))
        console.print(t)
        return

    sites = [s for s in all_sites if not args.site or s["id"] == args.site.lower()]
    if not sites:
        sys.exit(f"No site with id '{args.site}'")
    todo = [s for s in sites if s.get("newsUrl") or s.get("feedUrl")]
    skipped = [s for s in sites if s not in todo]
    console.print(f"\n[bold]Penn News Monitor[/bold] — scraping [cyan]{len(todo)}[/cyan] sites"
                  f"{f' · {len(skipped)} without a URL' if skipped else ''} · {args.concurrency} at a time\n")

    results = {}
    sem = asyncio.Semaphore(args.concurrency)
    dump_dir = (Path(__file__).parent / "html_dumps") if args.dump_html else None
    label = lambda m: ("[green]feed[/green]" if m.startswith("feed") else "[cyan]jsonld[/cyan]" if m == "jsonld"
                       else "[yellow]html[/yellow]" if m == "html" else "[dim]—[/dim]")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)

        async def one(site):
            async with sem:
                return site, await scrape_site(browser, site, args.timeout, dump_dir)

        with Progress(SpinnerColumn(), TextColumn("{task.description}"), BarColumn(),
                      MofNCompleteColumn(), console=console) as prog:
            task = prog.add_task("Scraping", total=len(todo))
            for fut in asyncio.as_completed([one(s) for s in todo]):
                site, (arts, err, method) = await fut
                results[site["id"]] = (arts, err, method)
                status = f"[green]{len(arts)} articles[/green]" if arts else f"[red]{(err or '0')[:60]}[/red]"
                prog.console.print(f"  {site['name'][:44]:44} {label(method):18} {status}")
                prog.advance(task)
        await browser.close()

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    out = Path(args.out or f"penn-news-scraped-{date.today().isoformat()}.json")
    out.write_text(json.dumps(build_snapshot(all_sites, results, now), indent=2, ensure_ascii=False), encoding="utf-8")

    by = lambda pred: sum(1 for _, _, m in results.values() if pred(m))
    good = sum(1 for a, _, _ in results.values() if a)
    console.print(f"\n[bold green]Done.[/bold green] {good}/{len(todo)} sites · "
                  f"{sum(len(a) for a, _, _ in results.values())} articles → [cyan]{out}[/cyan]")
    console.print(f"  [green]{by(lambda m: m.startswith('feed'))} feed[/green] · [cyan]{by(lambda m: m == 'jsonld')} jsonld[/cyan] · "
                  f"[yellow]{by(lambda m: m == 'html')} html[/yellow]   — import via the dashboard's Import button\n")
    empty = [s for s in todo if not results[s["id"]][0]]
    if empty:
        console.print(f"[yellow]{len(empty)} returned nothing[/yellow] (re-run with --site ID --dump-html and send the dump):")
        for s in empty:
            console.print(f"  {s['name']} — {results[s['id']][1] or ''}")
    if skipped:
        console.print(f"\n[dim]{len(skipped)} skipped (no URL): {', '.join(s['name'] for s in skipped)}[/dim]")

def main():
    p = argparse.ArgumentParser(description="Penn News Monitor scraper — feed-first, browser fallback")
    p.add_argument("--site"); p.add_argument("--out")
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--timeout", type=int, default=25)
    p.add_argument("--list", action="store_true")
    p.add_argument("--install-browser", action="store_true")
    p.add_argument("--dump-html", action="store_true")
    args = p.parse_args()
    if args.install_browser:
        import subprocess
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        return
    asyncio.run(run(args))

if __name__ == "__main__":
    main()
