(function () {
  const STORAGE_KEY = "pennNewsMonitorHostedV2";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const MAX_ITEMS_PER_STREAM = 20;

  const icons = {
    panel: svg(`<path d="M4 4h16v4H4zM4 10h10v10H4zM16 10h4v10h-4z"/>`),
    sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`),
    moon: svg(`<path d="M21 12.79A9 9 0 1 1 11.21 3c0 .37.02.74.07 1.1A7 7 0 0 0 19.9 12.7c.36.05.73.09 1.1.09Z"/>`),
    plus: svg(`<path d="M12 5v14M5 12h14"/>`),
    calendar: svg(`<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`),
    search: svg(`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`),
    refresh: svg(`<path d="M20 11a8 8 0 0 0-15.5-2M4 13a8 8 0 0 0 15.5 2"/><path d="M4 4v5h5M20 20v-5h-5"/>`),
    chevronLeft: svg(`<path d="m15 18-6-6 6-6"/>`),
    chevronRight: svg(`<path d="m9 18 6-6-6-6"/>`),
    chart: svg(`<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>`),
    save: svg(`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>`),
    upload: svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5-5 5 5"/><path d="M12 5v12"/>`),
    close: svg(`<path d="m18 6-12 12M6 6l12 12"/>`),
    external: svg(`<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>`),
    edit: svg(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`)
  };

  function svg(inner) {
    return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function toISODate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function fmtDate(dateString) {
    // Calendar dates have no timezone; avoid shifting them into the previous day.
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? dateString + "T12:00:00" : dateString);
    if (Number.isNaN(d.getTime())) return dateString || "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function fmtDateTime(dateString) {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function fmtToday(date) {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }

  function fmtWeekRange(weekStart) {
    const end = addDays(weekStart, 6);
    return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  function getWeekNumber(date) {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  }

  function isSameDay(isoA, isoB) {
    return (isoA || "").slice(0,10) === (isoB || "").slice(0,10);
  }

  function stripHtml(input) {
    if (!input) return "";
    const div = document.createElement("div");
    div.innerHTML = input;
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }

  function safeText(input) {
    return String(input || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function summarize(text, maxLen) {
    const cleaned = stripHtml(text);
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeCode(name) {
    const parts = String(name || "NEW").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 4);
    const code = parts.map(part => part[0]).join("").toUpperCase();
    return (code || "NEW").padEnd(3, "X").slice(0, 4);
  }

  function dedupePosts(posts) {
    const seen = new Set();
    const out = [];
    for (const post of posts) {
      const key = [post.stream, (post.link || "").trim(), (post.title || "").trim(), (post.date || "").slice(0, 10)].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(post);
    }
    return out.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function parseDateLoose(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    let text = String(value).trim();
    if (!text) return null;
    text = text.replace(/\s+/g, " ");
    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) return direct;
    const maybe = text.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/, "$1/$2/20$3");
    const second = new Date(maybe);
    if (!Number.isNaN(second.getTime())) return second;
    return null;
  }

  const MONTH_NAMES = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
  const DATE_TEXT_PATTERNS = [
    new RegExp(`\\b(?:${MONTH_NAMES})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "i"),
    new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAMES})\\.?,?\\s+\\d{4}\\b`, "i"),
    /\b\d{4}-\d{2}-\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/
  ];

  // Last-resort date finder: scans free text for a recognizable date string.
  // Many Penn unit pages render the date as a plain text node next to the
  // headline rather than inside a <time> element or a class the generic
  // selectors know about.
  function extractDateFromText(text) {
    if (!text) return null;
    const normalized = text.replace(/\s+/g, " ");
    for (const pattern of DATE_TEXT_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        const date = parseDateLoose(match[0]);
        if (date) return date;
      }
    }
    return null;
  }

  function absoluteUrl(href, base) {
    try {
      return new URL(href, base).href;
    } catch {
      return href;
    }
  }

  function unique(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function buildFeedCandidates(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      const base = u.toString();
      const out = [base];
      const variants = ["feed", "feed/", "rss", "rss/", "index.xml", "feed.xml"];
      let path = u.pathname || "/";
      if (!path.endsWith("/")) path += "/";
      for (const v of variants) {
        const next = new URL(base);
        next.pathname = path + v;
        next.search = "";
        next.hash = "";
        out.push(next.toString());
      }
      const rootFeed = new URL(base);
      rootFeed.pathname = "/feed/";
      rootFeed.search = "";
      out.push(rootFeed.toString());
      const rootRss = new URL(base);
      rootRss.pathname = "/rss/";
      rootRss.search = "";
      out.push(rootRss.toString());
      return unique(out);
    } catch {
      return [url];
    }
  }

  // Same-origin server-side proxy, provided by /functions/api/fetch.js when
  // this app is deployed on Cloudflare Pages. Running requests through this
  // first sidesteps CORS entirely, since the request leaves from Cloudflare's
  // servers rather than the visitor's browser.
  const OWN_PROXY_AVAILABLE = typeof location !== "undefined" && /^https?:$/.test(location.protocol || "");

  function ownProxyUrl(url) {
    return `/api/fetch?url=${encodeURIComponent(url)}`;
  }

  async function fetchTextAuto(url) {
    const accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8";
    const attempts = [];

    if (OWN_PROXY_AVAILABLE) {
      attempts.push(async () => {
        const res = await fetch(ownProxyUrl(url), { headers: { "Accept": accept } });
        const text = await res.text();
        if (!res.ok) {
          let detail = `Proxy HTTP ${res.status}`;
          try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.error) detail = parsed.error;
          } catch (_) {}
          throw new Error(detail);
        }
        return text;
      });
    }

    attempts.push(async () => {
      const res = await fetch(url, { headers: { "Accept": accept } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    });

    attempts.push(async () => {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      return await res.text();
    });

    attempts.push(async () => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Proxy JSON HTTP ${res.status}`);
      const json = await res.json();
      if (!json || typeof json.contents !== "string") throw new Error("Proxy returned no contents");
      return json.contents;
    });

    attempts.push(async () => {
      const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      return await res.text();
    });

    let lastErr = null;
    for (const attempt of attempts) {
      try {
        const text = await attempt();
        if (text) return text;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Unable to fetch URL");
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  // ── Vision worker fallback ─────────────────────────────────────────────────
  // When both feed discovery and raw-HTML scraping come up empty (usually
  // because the page builds its news list with client-side JavaScript), we
  // call the separate vision Worker that spins up a real headless browser,
  // takes a screenshot, and asks Claude to read it like a news staffer would.
  //
  // The worker URL is inferred from the current hostname:
  //   https://penn-news-monitor.pages.dev  →  https://penn-news-vision.<account>.workers.dev
  // Override by setting window.VISION_WORKER_URL before app.js loads.
  const VISION_WORKER_URL = (() => {
    if (typeof window !== "undefined" && window.VISION_WORKER_URL) {
      return window.VISION_WORKER_URL;
    }
    // Will be set correctly by the user after deploying the worker (see DEPLOY.md)
    return null;
  })();

  async function fetchVisionArticles(pageUrl) {
    if (!VISION_WORKER_URL) throw new Error("Vision worker URL not configured");
    const endpoint = `${VISION_WORKER_URL.replace(/\/$/, "")}/screenshot?url=${encodeURIComponent(pageUrl)}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      let detail = `Vision worker HTTP ${res.status}`;
      try {
        const json = await res.json();
        if (json?.error) detail = json.error;
      } catch (_) {}
      throw new Error(detail);
    }
    return await res.json(); // array of { title, link, date, dek }
  }

  function looksLikeFeed(text) {
    if (!text) return false;
    const trimmed = text.trim();
    return /^<\?xml/i.test(trimmed) || /^<rss/i.test(trimmed) || /^<feed/i.test(trimmed) || /<rss[\s>]/i.test(trimmed) || /<feed[\s>]/i.test(trimmed) || /<rdf:RDF/i.test(trimmed);
  }

  function extractFeedLinksFromHtml(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      'link[rel~="alternate"][type*="rss"]',
      'link[rel~="alternate"][type*="atom"]',
      'a[href*="/feed"]',
      'a[href$=".xml"]'
    ];
    const urls = [];
    selectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(el => {
        const href = el.getAttribute("href");
        if (href) urls.push(absoluteUrl(href, pageUrl));
      });
    });
    return unique(urls);
  }

  function parseFeedXml(xmlText, streamLabel) {
    const xml = new DOMParser().parseFromString(xmlText, "text/xml");
    if (xml.querySelector("parsererror")) throw new Error("Feed parse error");
    const items = [...xml.querySelectorAll("item")].map(item => {
      const title = item.querySelector("title")?.textContent?.trim() || "";
      const link = item.querySelector("link")?.textContent?.trim() || item.querySelector("guid")?.textContent?.trim() || "";
      const pubDate = item.querySelector("pubDate")?.textContent || item.querySelector("dc\\:date, date")?.textContent || "";
      const description = item.querySelector("description")?.textContent || item.querySelector("content\\:encoded")?.textContent || "";
      const date = parseDateLoose(pubDate);
      return {
        title,
        link,
        date: date ? date.toISOString() : "",
        dek: summarize(description, 220),
        stream: streamLabel,
        source: "feed"
      };
    });

    if (items.length) return items.filter(item => item.title && item.date);

    const entries = [...xml.querySelectorAll("entry")].map(entry => {
      const title = entry.querySelector("title")?.textContent?.trim() || "";
      const linkEl = entry.querySelector("link[href]");
      const link = linkEl?.getAttribute("href") || entry.querySelector("id")?.textContent?.trim() || "";
      const dateText = entry.querySelector("published, updated")?.textContent || "";
      const summary = entry.querySelector("summary, content")?.textContent || "";
      const date = parseDateLoose(dateText);
      return {
        title,
        link,
        date: date ? date.toISOString() : "",
        dek: summarize(summary, 220),
        stream: streamLabel,
        source: "feed"
      };
    });

    return entries.filter(item => item.title && item.date);
  }

  function parseRss2Json(payload, streamLabel) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.map(item => {
      const date = parseDateLoose(item.pubDate || item.published || item.updated);
      return {
        title: stripHtml(item.title || ""),
        link: item.link || "",
        date: date ? date.toISOString() : "",
        dek: summarize(item.description || item.content || "", 220),
        stream: streamLabel,
        source: "rss2json"
      };
    }).filter(item => item.title && item.date);
  }

  function parseHtmlFallback(htmlText, pageUrl, streamLabel) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const candidates = [];
    const seenLinks = new Set();
    const selector = [
      "article",
      ".views-row",
      ".view-content > div",
      ".node--type-news",
      ".node--view-mode-teaser",
      ".node-teaser",
      ".teaser",
      ".news-item",
      ".news-card",
      ".news-list-item",
      ".post",
      ".post-item",
      ".story",
      ".card",
      ".entry",
      ".result-item",
      ".search-result",
      ".feed-item",
      ".list-item",
      "[class*='views-row']",
      "[class*='teaser']",
      "[class*='news-item']",
      "[class*='news-card']",
      "li"
    ].join(",");

    const skipTextRe = /^(read more|learn more|view all|continue reading|see more|more news|more stories|next|previous|home|menu|search|subscribe|filter results|load more|skip to content|back to top)$/i;

    doc.querySelectorAll(selector).forEach(node => {
      const a = node.querySelector("h1 a, h2 a, h3 a, h4 a, h5 a, a[rel='bookmark'], a.title, a.headline, a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;

      const title = stripHtml(a.textContent || "");
      if (!title || title.length < 8 || skipTextRe.test(title.trim())) return;

      const link = absoluteUrl(href, pageUrl);
      if (seenLinks.has(link)) return;

      const timeNode = node.querySelector("time");
      const dateText = timeNode?.getAttribute("datetime")
        || timeNode?.textContent
        || node.querySelector(".date, .post-date, .field--name-created, .field--name-field-date, .news-date, .meta-date, .teaser-date")?.textContent
        || "";
      let date = parseDateLoose(dateText);
      if (!date) date = extractDateFromText(node.textContent || "");
      if (!date) return;

      seenLinks.add(link);
      const dekNode = node.querySelector("p, .field--name-body, .field--name-field-summary, .summary, .teaser-text, .dek, .description");
      const dek = summarize(dekNode?.innerHTML || "", 220);
      candidates.push({
        title,
        link,
        date: date.toISOString(),
        dek,
        stream: streamLabel,
        source: "html"
      });
    });
    return dedupePosts(candidates).slice(0, MAX_ITEMS_PER_STREAM);
  }

  // Parses the markdown returned by the render proxy (r.jina.ai). There's no
  // HTML structure to key off here, so this looks for markdown links whose
  // surrounding text contains a recognizable date - a reasonable proxy for
  // "this link is a dated news item" versus a nav link.
  function parseMarkdownFallback(markdownText, pageUrl, streamLabel) {
    if (!markdownText) return [];
    const candidates = [];
    const seenLinks = new Set();
    const skipTextRe = /^(read more|learn more|view all|continue reading|see more|more news|more stories|next|previous|home|menu|search|subscribe|filter results|load more|skip to content|back to top|share|print|email|facebook|twitter|linkedin|instagram|youtube|contact|about|events|news|directory|login|donate|all news|all stories)$/i;
    const linkRe = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g;

    let match;
    while ((match = linkRe.exec(markdownText))) {
      const title = stripHtml(match[1].trim());
      const href = match[2];
      if (!title || title.length < 10 || skipTextRe.test(title)) continue;
      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf)(\?|$)/i.test(href)) continue;
      if (/^(mailto|tel|javascript):/i.test(href)) continue;
      if (/facebook\.com|twitter\.com|x\.com\/intent|linkedin\.com\/(share|sharing)|instagram\.com/i.test(href)) continue;

      const link = absoluteUrl(href, pageUrl);
      if (seenLinks.has(link)) continue;

      const windowStart = Math.max(0, match.index - 300);
      const windowEnd = Math.min(markdownText.length, match.index + match[0].length + 300);
      const date = extractDateFromText(markdownText.slice(windowStart, windowEnd));
      if (!date) continue;

      seenLinks.add(link);
      const afterText = markdownText.slice(match.index + match[0].length, match.index + match[0].length + 280);
      const dek = summarize(stripHtml(afterText.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")), 220);
      candidates.push({
        title,
        link,
        date: date.toISOString(),
        dek,
        stream: streamLabel,
        source: "render"
      });
    }
    return dedupePosts(candidates).slice(0, MAX_ITEMS_PER_STREAM);
  }

  async function discoverFeedUrl(listUrl) {
    const candidates = buildFeedCandidates(listUrl);
    for (const candidate of candidates) {
      try {
        const text = await fetchTextAuto(candidate);
        if (looksLikeFeed(text)) return candidate;
      } catch (_) {}
    }
    try {
      const html = await fetchTextAuto(listUrl);
      const discovered = extractFeedLinksFromHtml(html, listUrl);
      for (const url of discovered) {
        try {
          const text = await fetchTextAuto(url);
          if (looksLikeFeed(text)) return url;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  async function fetchStreamItems(listUrl, streamLabel, cacheObj) {
    if (!listUrl) return [];
    const cachedFeed = cacheObj?.feedUrl || null;
    const feedUrl = cachedFeed || await discoverFeedUrl(listUrl);
    if (feedUrl) {
      try {
        const text = await fetchTextAuto(feedUrl);
        const parsed = parseFeedXml(text, streamLabel);
        if (parsed.length) return { items: parsed.slice(0, MAX_ITEMS_PER_STREAM), feedUrl, source: "feed" };
      } catch (_) {}
      try {
        const json = await fetchJson(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
        const parsed = parseRss2Json(json, streamLabel);
        if (parsed.length) return { items: parsed.slice(0, MAX_ITEMS_PER_STREAM), feedUrl, source: "rss2json" };
      } catch (_) {}
    }
    const htmlText = await fetchTextAuto(listUrl);
    const htmlItems = parseHtmlFallback(htmlText, listUrl, streamLabel);
    if (htmlItems.length) return { items: htmlItems, feedUrl: feedUrl || "", source: "html" };

    // Last resort: the page is almost certainly JavaScript-rendered and the
    // raw HTML fetch came back with an empty shell. Send it to the vision
    // worker, which launches a real browser, takes a screenshot, and has
    // Claude extract the articles visually.
    try {
      const visionArticles = await fetchVisionArticles(listUrl);
      if (Array.isArray(visionArticles) && visionArticles.length) {
        const items = visionArticles.map(a => ({
          title: stripHtml(a.title || ""),
          link: absoluteUrl(a.link || "", listUrl),
          date: a.date ? (parseDateLoose(a.date) || new Date()).toISOString() : new Date().toISOString(),
          dek: stripHtml(a.dek || ""),
          stream: streamLabel,
          source: "vision"
        })).filter(a => a.title && a.link);
        if (items.length) return { items: dedupePosts(items).slice(0, MAX_ITEMS_PER_STREAM), feedUrl: feedUrl || "", source: "vision" };
      }
    } catch (_) {}

    return { items: htmlItems, feedUrl: feedUrl || "", source: "html" };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("no state");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("bad state");
      return parsed;
    } catch {
      return {
        theme: "dark",
        query: "",
        showOnlyActive: false,
        includeMagazine: false,
        compactCards: false,
        gridMode: false,
        selectedWeekStart: toISODate(startOfWeek(new Date())),
        sites: structuredClone(window.PENN_MONITOR_DEFAULT_SITES || []),
        lastRefreshAt: "",
        refreshErrors: []
      };
    }
  }

  let state = loadState();
  // Always pin the week to the current week on startup — a stale snapshot
  // can carry a future selectedWeekStart that makes everything disappear.
  state.selectedWeekStart = toISODate(startOfWeek(new Date()));
  let runtime = {
    loading: false,
    progress: { done: 0, total: 0, label: "" },
    refreshToken: 0
  };

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(message) {
    const wrap = document.getElementById("toastWrap");
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function getSelectedWeekStart() {
    return new Date(`${state.selectedWeekStart}T12:00:00`);
  }

  function getWeekPostsForSite(site) {
    const weekStart = toISODate(getSelectedWeekStart());
    const weekEnd = toISODate(addDays(getSelectedWeekStart(), 7));
    return (site.posts || [])
      .filter(post => state.includeMagazine || post.stream !== "magazine")
      .filter(post => {
        // Compare as plain date strings (YYYY-MM-DD) to avoid UTC/local timezone
        // mismatches that silently push articles outside the visible week window.
        const d = (post.date || "").slice(0, 10);
        return d >= weekStart && d < weekEnd;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function getStatus(site, posts) {
    if (site.lastError) return { label: "Error", cls: "err" };
    if (posts.length >= 3) return { label: "Active", cls: "ok" };
    if (posts.length >= 1) return { label: "Live", cls: "ok" };
    return { label: "No items", cls: "idle" };
  }

  // Build the group layout from window.PENN_MONITOR_GROUPS + current sites
  function buildGroups(sites) {
    const groups = window.PENN_MONITOR_GROUPS || [];
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    const assigned = new Set();

    const result = groups.map(g => {
      const groupSites = (g.sites || [])
        .map(id => siteMap[id])
        .filter(Boolean);
      groupSites.forEach(s => assigned.add(s.id));
      return { ...g, sites: groupSites };
    }).filter(g => g.sites.length > 0);

    // Unassigned sites go into a catch-all group
    const rest = sites.filter(s => !assigned.has(s.id));
    if (rest.length) {
      result.push({ id: "other", label: "University", color: "#555", sites: rest });
    }
    return result;
  }

  function filteredSites() {
    const q = state.query.trim().toLowerCase();
    return state.sites.map(site => {
      const posts = getWeekPostsForSite(site);
      return { ...site, visiblePosts: posts };
    }).filter(site => {
      if (state.showOnlyActive && !site.visiblePosts.length) return false;
      if (!q) return true;
      return [site.name, site.bucket, site.subhead,
        ...site.visiblePosts.map(p => p.title + " " + (p.dek || ""))
      ].join(" ").toLowerCase().includes(q);
    });
  }

  function render() {
    document.body.dataset.theme = state.theme;

    const allSitesWithPosts = state.sites.map(s => ({ ...s, visiblePosts: getWeekPostsForSite(s) }));
    const q = state.query.trim().toLowerCase();
    const activeSites = allSitesWithPosts.filter(s => s.visiblePosts.length > 0);
    const totalItems = allSitesWithPosts.reduce((n, s) => n + s.visiblePosts.length, 0);
    const weekStart = getSelectedWeekStart();
    const progressPct = runtime.progress.total
      ? Math.round((runtime.progress.done / runtime.progress.total) * 100) : 0;

    // Apply search + active filter
    const visibleSites = allSitesWithPosts.filter(site => {
      if (state.showOnlyActive && !site.visiblePosts.length) return false;
      if (!q) return true;
      return [site.name, site.bucket, site.subhead,
        ...site.visiblePosts.map(p => p.title + " " + (p.dek || ""))
      ].join(" ").toLowerCase().includes(q);
    });

    const visibleIds = new Set(visibleSites.map(s => s.id));
    const groups = buildGroups(visibleSites);

    document.getElementById("app").innerHTML = `
      <div class="page">

        <!-- Masthead -->
        <header class="masthead">
          <div class="masthead-left">
            <div class="masthead-flag">Penn News Monitor</div>
            <div class="masthead-date">
              ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              &nbsp;·&nbsp; Week of ${fmtDate(state.selectedWeekStart)}
            </div>
          </div>
          <div class="masthead-actions">
            <button class="btn" data-action="toggle-theme">
              ${state.theme === "dark" ? icons.sun + " Day" : icons.moon + " Night"}
            </button>
            <button class="btn" data-action="import-json">${icons.upload} Import</button>
            <button class="btn" data-action="export-json">${icons.save} Export</button>
            <button class="btn" data-action="open-sites-editor">${icons.edit} All sites</button>
            <button class="btn btn-primary" data-action="refresh-all">
              ${runtime.loading ? '<span class="spinner"></span> Refreshing…' : icons.refresh + " Check for updates"}
            </button>
          </div>
        </header>

        <!-- Progress bar (visible while loading) -->
        ${runtime.loading ? `
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${progressPct}%"></div>
          </div>
          <div class="refresh-status">
            <span class="spinner"></span>
            ${safeText(runtime.progress.label || "Checking sources")}
            &nbsp;·&nbsp; ${runtime.progress.done}/${runtime.progress.total}
          </div>
        ` : ""}

        <div class="hosted-status" role="status">
          ${safeText(runtime.hostedMessage || 'Loading the shared news collection…')}
          <a href="help.html">Help &amp; source changes</a>
        </div>
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="toolbar-search">
            <span class="toolbar-search-icon">${icons.search}</span>
            <input id="queryInput" placeholder="Search desks, topics, headlines…" value="${safeText(state.query)}">
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button class="btn-icon" data-action="prev-week" title="Previous week">${icons.chevronLeft}</button>
            <span class="week-label">${fmtWeekRange(weekStart)}</span>
            <button class="btn-icon" data-action="next-week" title="Next week">${icons.chevronRight}</button>
            <button class="btn" data-action="this-week">This week</button>
          </div>
          <div class="toolbar-divider"></div>
          <div class="toolbar-group">
            <button class="btn ${state.showOnlyActive ? "active-filter" : ""}" data-action="toggle-active">
              Active only
            </button>
            <button class="btn ${state.includeMagazine ? "active-filter" : ""}" data-action="toggle-magazine">
              Magazine
            </button>
          </div>
        </div>

        <!-- Summary strip -->
        <div class="summary-strip">
          <span><strong>${totalItems}</strong> items this week</span>
          <span class="summary-strip-dot">·</span>
          <span><strong>${activeSites.length}</strong> active desks</span>
          <span class="summary-strip-dot">·</span>
          <span><strong>${state.sites.length}</strong> desks tracked</span>
          ${state.lastRefreshAt ? `
            <span class="summary-strip-dot">·</span>
            <span>Latest collection ${fmtDateTime(state.lastRefreshAt)}</span>
          ` : ""}
          ${q ? `
            <span class="summary-strip-dot">·</span>
            <span>Filtered to <strong>${visibleSites.length}</strong> desks</span>
          ` : ""}
        </div>

        <!-- Body -->
        <div class="body-grid">

          <!-- Section nav -->
          <nav class="section-nav">
            <div class="section-nav-label">Sections</div>
            ${buildGroups(allSitesWithPosts).map(g => {
              const groupTotal = g.sites.reduce((n, s) => n + (s.visiblePosts || []).length, 0);
              return `
                <button class="section-nav-item" data-action="jump-section" data-section-id="${g.id}">
                  <span class="section-nav-dot ${groupTotal > 0 ? "has-content" : ""}"></span>
                  ${safeText(g.label)}
                  <span class="section-nav-count">${groupTotal || ""}</span>
                </button>
              `;
            }).join("")}
          </nav>

          <!-- Main content -->
          <main class="main-content">
            ${groups.length ? groups.map(g => renderGroup(g)).join("") : `
              <div style="padding:40px 24px;color:var(--dim);font-size:13px">
                No desks match the current search or filter.
              </div>
            `}
          </main>

        </div>

      </div>

      ${renderAddModal()}
      ${renderSitesEditor()}
      <input type="file" id="jsonFileInput" accept=".json" class="hidden">
    `;

    document.getElementById("queryInput").addEventListener("input", e => {
      state.query = e.target.value;
      saveState();
      render();
    });

    wireActions();
  }

  function renderGroup(group) {
    const totalItems = group.sites.reduce((n, s) => n + (s.visiblePosts || []).length, 0);
    const activeCount = group.sites.filter(s => (s.visiblePosts || []).length > 0).length;
    const collapsed = !!state.collapsedSections[group.id];
    return `
      <section class="institution-section" id="section-${group.id}">
        <button class="institution-header" data-action="toggle-section" data-section-id="${group.id}" style="width:100%;text-align:left;border:none;background:none;cursor:pointer;display:flex;align-items:center;gap:14px;padding:20px 24px 12px;border-bottom:1px solid var(--rule)">
          <div class="institution-rule" style="background:${group.color};flex-shrink:0"></div>
          <h2 class="institution-name" style="margin:0;flex:1">${safeText(group.label)}</h2>
          <div class="institution-stats">
            ${totalItems} item${totalItems !== 1 ? "s" : ""} &nbsp;·&nbsp; ${activeCount}/${group.sites.length} active
          </div>
          <span style="font-size:18px;color:var(--dim);margin-left:8px;line-height:1">${collapsed ? "+" : "−"}</span>
        </button>
        ${collapsed ? "" : group.sites.map(site => renderDeskRow(site)).join("")}
      </section>
    `;
  }

  function renderDeskRow(site) {
    const posts = site.visiblePosts || [];
    const status = getStatus(site, posts);
    const lastSync = site.lastSyncAt ? fmtDateTime(site.lastSyncAt) : null;
    return `
      <div class="desk-row">
        <div class="desk-meta">
          <div class="desk-name">${safeText(site.name)}</div>
          <div class="desk-type">${safeText(site.bucket || "Unit")}</div>
          <div class="desk-status ${status.cls}">${status.label}</div>
          ${site.lastError ? `<div class="source-warning">${safeText(site.lastError)}</div>` : ""}
          ${lastSync ? `<div style="font-size:10px;font-family:var(--mono);color:var(--dim);margin-top:2px">${safeText(lastSync)}</div>` : ""}
          <div class="desk-actions">
            ${site.newsUrl ? `<a class="btn" href="${safeText(site.newsUrl)}" target="_blank" rel="noreferrer" style="font-size:11px;padding:3px 7px">${icons.external}</a>` : ""}
            
            
          </div>
        </div>
        <div class="story-list">
          ${posts.length
            ? posts.map(post => `
              <div class="story-item">
                <div>
                  ${post.stream === "magazine" ? `<span class="story-tag">Magazine</span><br>` : ""}
                  ${post.link
                    ? `<a class="story-hed" href="${safeText(post.link)}" target="_blank" rel="noreferrer">${safeText(post.title)}</a>`
                    : `<span class="story-hed">${safeText(post.title)}</span>`}
                  ${post.dek ? `<div class="story-dek">${safeText(post.dek)}</div>` : ""}
                </div>
                <div class="story-date">${fmtDate(post.date)}</div>
              </div>
            `).join("")
            : `<div class="story-empty ${site.lastError ? "error" : ""}">
                ${safeText(site.lastError || (site.newsUrl ? "No articles in the selected week." : "No URL configured."))}
               </div>`
          }
        </div>
      </div>
    `;
  }

  function renderAddModal() {
    const editing = state.editingSiteId ? state.sites.find(s => s.id === state.editingSiteId) : null;
    const v = (field, fallback = "") => safeText(editing ? (editing[field] ?? fallback) : fallback);
    const buckets = ["School","Department","Center","Institute","Program","Affiliate","Lab","House","Museum","Gallery","Unit","Library","Partnership"];
    return `
      <div id="modalOverlay" class="overlay ${state.showAddSite ? "" : "hidden"}">
        <div class="modal">
          <div class="modal-head">
            <div>
              <h3 class="modal-title">${editing ? "Edit desk" : "Add a desk"}</h3>
              <p class="modal-sub">${editing
                ? "Update the URL or details for this desk. Saving clears the cached feed so the next refresh starts fresh."
                : "Add a Penn communications desk. The dashboard will try to discover its feed automatically from the URL you provide."
              }</p>
            </div>
            <button class="btn-icon" data-action="close-add" aria-label="Close">${icons.close}</button>
          </div>
          <div class="modal-body">
            <form id="addSiteForm" class="form-grid">
              <div>
                <label class="label">Desk name</label>
                <input class="input" name="name" placeholder="Penn Museum" value="${v("name")}">
              </div>
              <div>
                <label class="label">Category</label>
                <select class="select" name="bucket">
                  ${buckets.map(b => `<option ${editing && editing.bucket === b ? "selected" : ""}>${b}</option>`).join("")}
                </select>
              </div>
              <div>
                <label class="label">Parent institution</label>
                <input class="input" name="parentUnit" placeholder="School of Arts & Sciences" value="${v("parentUnit")}">
              </div>
              <div>
                <label class="label">Topics / subhead</label>
                <input class="input" name="subhead" placeholder="History, archaeology, collections" value="${v("subhead")}">
              </div>
              <div class="full">
                <label class="label">News URL</label>
                <input class="input" name="newsUrl" placeholder="https://example.upenn.edu/news" value="${v("newsUrl")}">
              </div>
              <div class="full">
                <label class="label">Magazine URL <span style="font-weight:400">(optional)</span></label>
                <input class="input" name="magazineUrl" placeholder="https://example.upenn.edu/magazine" value="${v("magazineUrl")}">
              </div>
              <div class="full small-note">
                A direct feed URL (<kbd>/feed/</kbd>, <kbd>rss.xml</kbd>) works more reliably than a news landing page, but either is fine — the dashboard will try to discover a feed from the page automatically.
              </div>
              <div class="full modal-actions">
                <button type="button" class="btn" data-action="close-add">Cancel</button>
                <button type="submit" class="btn btn-primary">${editing ? "Save changes" : "Add desk"}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function renderSitesEditor() {
    if (!state.showSitesEditor) return "";
    const sites = state.sites;
    return `
      <div id="sitesEditorOverlay" class="overlay">
        <div class="modal" style="width:min(1000px,96%);max-height:92vh">
          <div class="modal-head">
            <div>
              <h3 class="modal-title">All sites</h3>
              <p class="modal-sub">${sites.length} desks tracked. Source settings are shared by the team. Contact the monitor owner to add or change a source.</p>
            </div>
            <button class="btn-icon" data-action="close-sites-editor" aria-label="Close">${icons.close}</button>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="border-bottom:2px solid var(--rule);text-align:left">
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500">Name</th>
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500">Bucket</th>
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500">Parent</th>
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500">News URL</th>
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500">Last sync</th>
                  <th style="padding:8px 12px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500"></th>
                </tr>
              </thead>
              <tbody>
                ${sites.map(s => {
                  const hasError = !!s.lastError;
                  const hasPosts = (s.posts || []).length > 0;
                  const statusColor = hasError ? "var(--err)" : hasPosts ? "var(--ok)" : "var(--idle)";
                  return `
                    <tr style="border-bottom:1px solid var(--rule-soft)" class="sites-editor-row">
                      <td style="padding:8px 12px;font-weight:600">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:7px;flex-shrink:0"></span>
                        ${safeText(s.name)}
                      </td>
                      <td style="padding:8px 12px;color:var(--dim);font-family:var(--mono);font-size:10px;text-transform:uppercase">${safeText(s.bucket || "")}</td>
                      <td style="padding:8px 12px;color:var(--dim)">${safeText(s.parentUnit || "")}</td>
                      <td style="padding:8px 12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);font-size:11px">
                        ${s.newsUrl ? `<a href="${safeText(s.newsUrl)}" target="_blank" rel="noreferrer" style="color:var(--accent)">${safeText(s.newsUrl)}</a>` : `<span style="color:var(--idle);font-style:italic">no URL</span>`}
                      </td>
                      <td style="padding:8px 12px;color:var(--dim);font-family:var(--mono);font-size:10px;white-space:nowrap">${s.lastSyncAt ? fmtDateTime(s.lastSyncAt) : "—"}${s.lastError ? `<div style="white-space:normal;color:var(--err);max-width:300px">${safeText(s.lastError)}</div>` : ""}</td>
                      <td style="padding:8px 12px;white-space:nowrap">
                        
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function wireActions() {
    document.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", onAction);
    });
    const form = document.getElementById("addSiteForm");
    if (form) form.addEventListener("submit", onAddSite);
    const fileInput = document.getElementById("jsonFileInput");
    if (fileInput) fileInput.addEventListener("change", onImportSnapshot);
    // Hover highlight for sites editor rows
    document.querySelectorAll(".sites-editor-row").forEach(row => {
      row.addEventListener("mouseenter", () => row.style.background = "var(--paper2)");
      row.addEventListener("mouseleave", () => row.style.background = "");
    });
  }

  async function onAction(e) {
    const action = e.currentTarget.dataset.action;
    const siteId = e.currentTarget.dataset.siteId;
    const sectionId = e.currentTarget.dataset.sectionId;

    if (action === "toggle-theme") { state.theme = state.theme === "dark" ? "light" : "dark"; saveState(); render(); return; }
    if (action === "toggle-active") { state.showOnlyActive = !state.showOnlyActive; saveState(); render(); return; }
    if (action === "toggle-magazine") { state.includeMagazine = !state.includeMagazine; saveState(); render(); return; }
    if (action === "prev-week") { state.selectedWeekStart = toISODate(addDays(getSelectedWeekStart(), -7)); saveState(); render(); return; }
    if (action === "next-week") { state.selectedWeekStart = toISODate(addDays(getSelectedWeekStart(), 7)); saveState(); render(); return; }
    if (action === "this-week") { state.selectedWeekStart = toISODate(startOfWeek(new Date())); saveState(); render(); return; }
    if (action === "open-add") { state.showAddSite = true; state.editingSiteId = null; saveState(); render(); return; }
    if (action === "edit-site") { state.showAddSite = true; state.editingSiteId = siteId; state.showSitesEditor = false; saveState(); render(); return; }
    if (action === "close-add") { state.showAddSite = false; state.editingSiteId = null; saveState(); render(); return; }
    if (action === "open-sites-editor") { state.showSitesEditor = true; saveState(); render(); return; }
    if (action === "close-sites-editor") { state.showSitesEditor = false; saveState(); render(); return; }
    if (action === "toggle-section") {
      const sid = e.currentTarget.dataset.sectionId;
      state.collapsedSections = { ...state.collapsedSections, [sid]: !state.collapsedSections[sid] };
      saveState(); render(); return;
    }
    if (action === "refresh-all") { await loadPublishedNews(true); return; }
    if (action === "refresh-site") { await refreshAllSites([siteId]); return; }
    if (action === "export-json") { exportSnapshot(); return; }
    if (action === "import-json") { document.getElementById("jsonFileInput").click(); return; }
    if (action === "reset-defaults") { resetDefaults(); return; }
    if (action === "jump-section") {
      const el = document.getElementById(`section-${sectionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }

  function onAddSite(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const parentUnit = String(form.get("parentUnit") || "").trim();
    const newsUrl = String(form.get("newsUrl") || "").trim();
    if (!name || !newsUrl) { toast("Name and news URL are required."); return; }
    const bucket = String(form.get("bucket") || "Unit").trim();
    const subhead = String(form.get("subhead") || "").trim();
    const magazineUrl = String(form.get("magazineUrl") || "").trim() || null;

    if (state.editingSiteId) {
      const site = state.sites.find(s => s.id === state.editingSiteId);
      if (!site) { toast("Site not found."); state.editingSiteId = null; state.showAddSite = false; saveState(); render(); return; }
      const urlsChanged = site.newsUrl !== newsUrl || (site.magazineUrl || "") !== (magazineUrl || "");
      site.name = name;
      site.parentUnit = parentUnit || name;
      site.bucket = bucket;
      site.subhead = subhead || site.subhead || "";
      site.newsUrl = newsUrl;
      site.magazineUrl = magazineUrl;
      if (urlsChanged) { site._cache = {}; site.lastError = ""; site.lastSource = ""; }
      state.editingSiteId = null;
      state.showAddSite = false;
      saveState(); render();
      toast(`Saved ${name}.${urlsChanged ? " Refresh to re-check sources." : ""}`);
      return;
    }

    state.sites.unshift({
      id: `${slugify(name)}-${Date.now()}`,
      name, parentUnit: parentUnit || name, bucket,
      subhead: subhead || "",
      code: makeCode(name),
      newsUrl, magazineUrl,
      posts: [], lastError: "", lastSyncAt: "", lastSource: ""
    });
    state.showAddSite = false;
    saveState(); render();
    toast(`Added ${name}.`);
  }

  function exportSnapshot() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `penn-news-monitor-snapshot-${toISODate(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  function onImportSnapshot(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!parsed || !Array.isArray(parsed.sites)) throw new Error("Bad snapshot");
        if (parsed.sites.some(s => !s || typeof s.id !== 'string' || !Array.isArray(s.posts))) throw new Error('Invalid source data');
        state = { ...state, ...parsed, importedSnapshot: true };
        runtime.refreshToken += 1;
        runtime.hostedMessage = 'Viewing an imported snapshot on this browser. Automatic updates are paused. Check for updates returns to the shared online collection.';
        saveState(); render();
        toast("Snapshot imported.");
      } catch { toast("That snapshot could not be read."); }
      finally { e.target.value = ""; }
    };
    reader.readAsText(file);
  }

  function resetDefaults() {
    if (!confirm("Reset the dashboard to defaults? This clears all fetched articles on this machine.")) return;
    state = {
      theme: state.theme,
      query: "",
      showOnlyActive: false,
      includeMagazine: false,
      selectedWeekStart: toISODate(startOfWeek(new Date())),
      sites: structuredClone(window.PENN_MONITOR_DEFAULT_SITES || []),
      lastRefreshAt: "",
      refreshErrors: [],
      showAddSite: false
    };
    saveState();
    render();
    toast("Defaults restored.");
  }

  async function refreshAllSites(onlyIds) {
    if (runtime.loading) return;
    runtime.loading = true;
    runtime.progress = { done: 0, total: onlyIds ? onlyIds.length : state.sites.length, label: "Starting refresh" };
    runtime.refreshToken += 1;
    const token = runtime.refreshToken;
    render();

    const ids = new Set(onlyIds || state.sites.map(site => site.id));
    const queue = state.sites.filter(site => ids.has(site.id));
    const concurrency = 4;
    let index = 0;
    const errors = [];

    async function worker() {
      while (index < queue.length) {
        const site = queue[index++];
        runtime.progress.label = `Refreshing ${site.name}`;
        render();
        try {
          await refreshSingleSite(site.id, token);
        } catch (err) {
          errors.push(`${site.name}: ${err.message || "refresh failed"}`);
        }
        runtime.progress.done += 1;
        render();
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
    state.lastRefreshAt = new Date().toISOString();
    state.refreshErrors = errors.slice(-10);
    saveState();
    runtime.loading = false;
    runtime.progress = { done: 0, total: 0, label: "" };
    render();
    toast(errors.length ? `Refresh finished with ${errors.length} issue${errors.length === 1 ? "" : "s"}.` : "Refresh finished.");
  }

  async function refreshSingleSite(siteId, token) {
    const site = state.sites.find(s => s.id === siteId);
    if (!site) return;
    site.lastError = "";
    const cache = site._cache || {};
    const streams = [
      { key: "news", label: "news", url: site.newsUrl },
      { key: "magazine", label: "magazine", url: site.magazineUrl }
    ].filter(stream => stream.url);

    let allPosts = [];
    let lastSource = "";

    for (const stream of streams) {
      if (token !== runtime.refreshToken) return;
      const streamCache = cache[stream.key] || {};
      const isFresh = streamCache.fetchedAt && (Date.now() - new Date(streamCache.fetchedAt).getTime() < CACHE_TTL_MS);
      if (isFresh && Array.isArray(streamCache.items) && streamCache.items.length) {
        allPosts = allPosts.concat(streamCache.items);
        lastSource = lastSource || streamCache.source || "";
        continue;
      }
      try {
        const result = await fetchStreamItems(stream.url, stream.label, streamCache);
        cache[stream.key] = {
          items: result.items,
          feedUrl: result.feedUrl || "",
          source: result.source || "",
          fetchedAt: new Date().toISOString()
        };
        allPosts = allPosts.concat(result.items);
        lastSource = lastSource || result.source || "";
      } catch (err) {
        cache[stream.key] = {
          items: [],
          feedUrl: streamCache.feedUrl || "",
          source: streamCache.source || "",
          fetchedAt: new Date().toISOString(),
          error: err.message || "refresh failed"
        };
      }
    }

    site._cache = cache;
    site.posts = dedupePosts(allPosts);
    site.lastSyncAt = new Date().toISOString();
    site.lastSource = lastSource;
    const streamErrors = Object.values(cache).map(entry => entry.error).filter(Boolean);
    site.lastError = site.posts.length ? "" : (streamErrors[0] || "No feed or article data could be extracted from this source yet.");
    saveState();
  }

  // initial UI state flags not stored in default snapshot
  if (typeof state.showAddSite !== "boolean") state.showAddSite = false;
  if (typeof state.editingSiteId === "undefined") state.editingSiteId = null;
  if (typeof state.collapsedSections === "undefined") state.collapsedSections = {};
  if (typeof state.showSitesEditor !== "boolean") state.showSitesEditor = false;

  render();

  async function loadPublishedNews(force = false) {
    if (state.importedSnapshot && !force) {
      runtime.hostedMessage = 'Viewing an imported snapshot on this browser. Automatic updates are paused. Check for updates returns to the shared online collection.';
      render();
      return;
    }
    if (runtime.loading) return;
    const loadToken = runtime.refreshToken;
    runtime.loading = true;
    runtime.hostedMessage = 'Checking the shared news collection…';
    render();
    try {
      const response = await fetch(new URL('data/latest.json', document.baseURI), {
        cache: 'no-store', signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error('Collection unavailable');
      const snapshot = await response.json();
      if (!Array.isArray(snapshot.sites) || !snapshot.sites.length ||
          !Number.isFinite(Date.parse(snapshot.lastRefreshAt)) ||
          snapshot.sites.some(s => typeof s.id !== 'string' || !Array.isArray(s.posts))) {
        throw new Error('Invalid collection');
      }
      if (loadToken !== runtime.refreshToken) return;
      state.importedSnapshot = false;
      state.sites = snapshot.sites;
      state.lastRefreshAt = snapshot.lastRefreshAt;
      const issues = snapshot.sites.filter(s => s.lastError).length;
      const old = Date.now() - Date.parse(snapshot.lastRefreshAt) > 30 * 3600000;
      runtime.hostedMessage = (old ? 'Updates are overdue. Contact the monitor owner. ' : '') +
        'Latest collection: ' + fmtDateTime(snapshot.lastRefreshAt) + '. ' +
        issues + ' sources need attention. Collection runs twice each weekday; this page checks for published results every five minutes.';
      try { saveState(); } catch (_) { /* News remains usable if browser storage is full. */ }
    } catch (error) {
      if (loadToken !== runtime.refreshToken) return;
      runtime.hostedMessage = 'Could not load updates. ' +
        (state.lastRefreshAt ? 'Showing saved results from ' + fmtDateTime(state.lastRefreshAt) + '. ' : '') +
        'Try again shortly or contact the monitor owner.';
    } finally {
      runtime.loading = false;
      render();
    }
  }
  loadPublishedNews();
  setInterval(loadPublishedNews, 5 * 60 * 1000);
})();
