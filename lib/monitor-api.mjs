// Server side of the monitor's "Check for updates" button and source editor.
// Runs as Cloudflare Pages Functions (see functions/api). The GitHub key and the
// team passcode are Cloudflare secrets (GITHUB_TOKEN, MONITOR_PASSCODE); neither
// ever reaches the browser or the repository.

export const DEFAULT_REPO = 'BigChief-at-illuminathidotorg/Penn-News-Scraper';
const WORKFLOW = 'collect.yml';
const BRANCH = 'main';
const SITES_FILE = 'sites.js';
export const COOLDOWN_MINUTES = 10;   // a collection that finished this recently is still fresh
export const MIN_PASSCODE = 12;
const MAX_SITES = 150;
const MAX_EXTRA_PAGES = 4;
export const BUCKETS = ['School', 'Center', 'Department', 'Institute', 'Program', 'Unit',
  'Affiliate', 'House', 'Lab', 'Gallery', 'Museum', 'Library'];
const KEY_ORDER = ['id', 'name', 'parentUnit', 'bucket', 'subhead', 'newsUrl', 'extraUrls',
  'magazineUrl', 'notes', 'posts', 'feedUrl', 'exportName'];
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function failure(e) {
  if (e instanceof ApiError) return reply(e.status, { error: e.message, ...e.extra });
  return reply(500, { error: 'Something went wrong on the server. Try again in a minute.' });
}

// ── Setup and passcode ─────────────────────────────────────────────────────
export function setupProblem(env) {
  if (!env.GITHUB_TOKEN || !env.MONITOR_PASSCODE) return 'missing';
  if (String(env.MONITOR_PASSCODE).length < MIN_PASSCODE) return 'weak-passcode';
  return '';
}

function config(env) {
  const problem = setupProblem(env);
  if (problem === 'missing') throw new ApiError(503, 'Changes from the monitor are not set up yet. Help explains the one-time setup.', { setup: problem });
  if (problem) throw new ApiError(503, `The team passcode saved in Cloudflare is too short. Use at least ${MIN_PASSCODE} characters.`, { setup: problem });
  return {
    token: env.GITHUB_TOKEN, passcode: String(env.MONITOR_PASSCODE),
    repo: env.GITHUB_REPO || DEFAULT_REPO,
    api: String(env.GITHUB_API || 'https://api.github.com').replace(/\/+$/, ''),
  };
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

/** Constant-time comparison (of hashes, so the length isn't revealed either). */
export async function samePasscode(given, expected) {
  const [a, b] = await Promise.all([sha256(given ?? ''), sha256(expected ?? '')]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function authorize(request, cfg, pause = 700) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'Changes must come from the monitor itself.');
  const given = request.headers.get('X-Monitor-Passcode') || '';
  if (!given || !(await samePasscode(given, cfg.passcode))) {
    if (pause) await new Promise(resolve => setTimeout(resolve, pause));   // slows down guessing
    throw new ApiError(401, 'That passcode was not accepted.', { passcode: 'wrong' });
  }
}

// ── GitHub ─────────────────────────────────────────────────────────────────
async function github(cfg, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(cfg.api + path, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'penn-news-monitor',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(502, 'GitHub could not be reached. Try again in a minute.');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const why = data?.message || `HTTP ${res.status}`;
    const message = res.status === 401 || res.status === 403
      ? `GitHub refused the monitor's key (${why}). Check the GITHUB_TOKEN secret and its permissions.`
      : `GitHub said: ${why}`;
    const err = new ApiError(502, message);
    err.githubStatus = res.status;
    throw err;
  }
  return data;
}

function describeRun(run) {
  return run ? { id: run.id, status: run.status, conclusion: run.conclusion, event: run.event,
    createdAt: run.created_at, updatedAt: run.updated_at, url: run.html_url } : null;
}

// ── "Check for updates": start a collection unless one is running or fresh ─
export async function startRun(request, env, { now = Date.now(), pause } = {}) {
  try {
    const cfg = config(env);
    await authorize(request, cfg, pause);
    const data = await github(cfg, `/repos/${cfg.repo}/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&per_page=5`);
    const runs = data?.workflow_runs || [];
    const active = runs.find(r => ACTIVE.has(r.status));
    if (active) return reply(200, { state: 'running', run: describeRun(active) });
    const last = runs[0];
    const minutes = last ? (now - Date.parse(last.updated_at)) / 60000 : Infinity;
    if (last && last.conclusion === 'success' && minutes < COOLDOWN_MINUTES) {
      return reply(200, { state: 'recent', run: describeRun(last), minutesAgo: Math.max(0, Math.round(minutes)) });
    }
    await github(cfg, `/repos/${cfg.repo}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: { ref: BRANCH } });
    return reply(202, { state: 'started', requestedAt: new Date(now).toISOString() });
  } catch (e) { return failure(e); }
}

// ── Passcode check and setup status for the page ──────────────────────────
export function sessionStatus(env) {
  const problem = setupProblem(env);
  return reply(200, { configured: !problem, setup: problem || null, minPasscode: MIN_PASSCODE });
}

export async function checkPasscode(request, env, { pause } = {}) {
  try {
    const cfg = config(env);
    await authorize(request, cfg, pause);
    return reply(200, { ok: true });
  } catch (e) { return failure(e); }
}

// ── sites.js: read, change, write back ────────────────────────────────────
/** End index (exclusive) of the JSON array or object starting at `start`. */
function jsonEnd(text, start) {
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  throw new ApiError(500, 'sites.js could not be read (unbalanced brackets).');
}

function locate(text, name) {
  const at = text.indexOf(`window.${name}`);
  if (at === -1) return null;
  const start = text.indexOf('[', at);
  const end = jsonEnd(text, start);
  return { start, end, value: JSON.parse(text.slice(start, end)) };
}

export function parseSitesJs(text) {
  const sites = locate(text, 'PENN_MONITOR_DEFAULT_SITES');
  if (!sites || !Array.isArray(sites.value)) throw new ApiError(500, 'sites.js has no source list.');
  const groups = locate(text, 'PENN_MONITOR_GROUPS');
  return { text, sites, groups };
}

export function serializeSitesJs(doc, sites, groups) {
  const t = doc.text, a = doc.sites, g = doc.groups;
  const list = JSON.stringify(sites, null, 2);
  if (!g) return t.slice(0, a.start) + list + t.slice(a.end);
  const groupText = JSON.stringify(groups, null, 2);
  return a.start < g.start
    ? t.slice(0, a.start) + list + t.slice(a.end, g.start) + groupText + t.slice(g.end)
    : t.slice(0, g.start) + groupText + t.slice(g.end, a.start) + list + t.slice(a.end);
}

const CONTROL = /[\u0000-\u001f\u007f]/g;
function cleanText(value, label, { max, min = 0 } = {}) {
  const v = String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (v.length < min) throw new ApiError(400, min > 1 ? `${label} needs at least ${min} characters.` : `${label} is required.`);
  if (v.length > max) throw new ApiError(400, `${label} can be at most ${max} characters.`);
  return v;
}

function cleanUrl(value, label, required) {
  const v = String(value ?? '').trim();
  if (!v) {
    if (required) throw new ApiError(400, `${label} is required.`);
    return null;
  }
  let u;
  try { u = new URL(v); } catch { throw new ApiError(400, `${label} must be a full web address, starting with https://`); }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || u.username || u.password || v.length > 500) {
    throw new ApiError(400, `${label} must be a full web address, starting with https://`);
  }
  return u.href;
}

const sameUrl = (a, b) => {
  try { return !!a && !!b && new URL(a).href.replace(/\/$/, '') === new URL(b).href.replace(/\/$/, ''); } catch { return false; }
};

export function slugify(name) {
  const s = String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'source';
}

function cleanSite(input) {
  if (!input || typeof input !== 'object') throw new ApiError(400, 'No source details were sent.');
  const extra = Array.isArray(input.extraUrls) ? input.extraUrls
    : String(input.extraUrls ?? '').split(/\s+/);
  const extraUrls = [];
  for (const raw of extra) {
    const u = cleanUrl(raw, 'Each extra page', false);
    if (u && !extraUrls.some(x => sameUrl(x, u))) extraUrls.push(u);
  }
  if (extraUrls.length > MAX_EXTRA_PAGES) throw new ApiError(400, `A source can have at most ${MAX_EXTRA_PAGES} extra pages.`);
  const bucket = cleanText(input.bucket || 'Unit', 'Type', { max: 30, min: 1 });
  if (!BUCKETS.includes(bucket)) throw new ApiError(400, `Type must be one of: ${BUCKETS.join(', ')}.`);
  const site = {
    name: cleanText(input.name, 'Name', { max: 80, min: 2 }),
    parentUnit: cleanText(input.parentUnit, 'School or unit', { max: 60, min: 1 }),
    bucket,
    subhead: cleanText(input.subhead, 'Description', { max: 120 }),
    newsUrl: cleanUrl(input.newsUrl, 'News page address', true),
    extraUrls,
    feedUrl: cleanUrl(input.feedUrl, 'Feed address', false),
    exportName: cleanText(input.exportName, 'Name in exports', { max: 60 }),
  };
  if (site.extraUrls.some(u => sameUrl(u, site.newsUrl))) site.extraUrls = site.extraUrls.filter(u => !sameUrl(u, site.newsUrl));
  return site;
}

function ordered(site) {
  const out = {};
  for (const k of KEY_ORDER) if (k in site) out[k] = site[k];
  for (const k of Object.keys(site)) if (!(k in out)) out[k] = site[k];
  return out;
}

function assertUnique(sites, input, exceptId) {
  for (const s of sites) {
    if (s.id === exceptId) continue;
    const pages = [s.newsUrl, ...(s.extraUrls || [])];
    if ([input.newsUrl, ...input.extraUrls].some(u => pages.some(p => sameUrl(p, u)))) {
      throw new ApiError(409, `That page is already read for ${s.name}.`);
    }
    if (s.name.toLowerCase() === input.name.toLowerCase()) throw new ApiError(409, `There is already a source named ${s.name}.`);
  }
}

/** Apply one change to the parsed lists. Pure: returns new lists and a summary. */
export function applyChange(sites, groups, change, now = new Date()) {
  if (!change || typeof change !== 'object') throw new ApiError(400, 'No change was sent.');
  const editor = cleanText(change.editor, 'Your name', { max: 60 }) || 'a team member';
  const day = now.toISOString().slice(0, 10);
  const list = sites.map(s => ({ ...s }));
  const groupList = groups ? groups.map(g => ({ ...g, sites: [...(g.sites || [])] })) : groups;
  const at = id => list.findIndex(s => s.id === id);

  if (change.action === 'remove') {
    const i = at(change.id);
    if (i < 0) throw new ApiError(404, 'That source is no longer in the list.');
    if (list.length <= 1) throw new ApiError(400, 'The last source cannot be removed.');
    const [gone] = list.splice(i, 1);
    if (groupList) for (const g of groupList) g.sites = g.sites.filter(id => id !== gone.id);
    return { sites: list, groups: groupList, removed: gone.id, summary: `Removed ${gone.name}.`,
      message: `Remove source: ${gone.name}\n\nRemoved from the monitor by ${editor}.` };
  }

  if (change.action !== 'add' && change.action !== 'update') throw new ApiError(400, 'Unknown kind of change.');
  const input = cleanSite(change.site);

  if (change.action === 'add') {
    if (list.length >= MAX_SITES) throw new ApiError(400, `The list is limited to ${MAX_SITES} sources.`);
    assertUnique(list, input, null);
    const base = slugify(input.name);
    let id = base;
    for (let n = 2; list.some(s => s.id === id); n++) id = `${base}-${n}`;
    const site = ordered({
      id, name: input.name, parentUnit: input.parentUnit, bucket: input.bucket, subhead: input.subhead,
      newsUrl: input.newsUrl, ...(input.extraUrls.length ? { extraUrls: input.extraUrls } : {}),
      magazineUrl: null, notes: `${day}: Added from the monitor by ${editor}.`, posts: [],
      feedUrl: input.feedUrl, ...(input.exportName ? { exportName: input.exportName } : {}),
    });
    list.push(site);
    return { sites: list, groups: groupList, site, summary: `Added ${site.name}.`,
      message: `Add source: ${site.name}\n\nAdded from the monitor by ${editor}.` };
  }

  const i = at(change.id);
  if (i < 0) throw new ApiError(404, 'That source is no longer in the list.');
  assertUnique(list, input, change.id);
  const old = list[i];
  const keep = (a, b) => (sameUrl(a, b) ? a : b);   // don't rewrite an address that didn't change
  const site = { ...old, name: input.name, parentUnit: input.parentUnit, bucket: input.bucket,
    subhead: input.subhead, newsUrl: keep(old.newsUrl, input.newsUrl),
    feedUrl: input.feedUrl && old.feedUrl ? keep(old.feedUrl, input.feedUrl) : input.feedUrl };
  const oldExtra = old.extraUrls || [];
  const extraUrls = input.extraUrls.map(u => oldExtra.find(x => sameUrl(x, u)) || u);
  if (extraUrls.length) site.extraUrls = extraUrls; else delete site.extraUrls;
  if (input.exportName) site.exportName = input.exportName; else delete site.exportName;
  const changed = JSON.stringify(ordered(site)) !== JSON.stringify(ordered(old));
  if (!changed) throw new ApiError(400, 'Nothing was changed.');
  list[i] = ordered(site);
  return { sites: list, groups: groupList, site: list[i], summary: `Saved ${site.name}.`,
    message: `Edit source: ${site.name}\n\nEdited from the monitor by ${editor}.` };
}

function decodeBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function readChange(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new ApiError(415, 'Send the change as JSON.');
  const text = await request.text();
  if (text.length > 20000) throw new ApiError(413, 'That change is too large.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'That change could not be read.'); }
}

export async function changeSources(request, env, { now = new Date(), pause } = {}) {
  try {
    const cfg = config(env);
    await authorize(request, cfg, pause);
    const change = await readChange(request);
    for (let attempt = 1; ; attempt++) {
      const file = await github(cfg, `/repos/${cfg.repo}/contents/${SITES_FILE}?ref=${BRANCH}`);
      const doc = parseSitesJs(decodeBase64(file.content));
      const result = applyChange(doc.sites.value, doc.groups?.value, change, now);
      const updated = serializeSitesJs(doc, result.sites, result.groups);
      try {
        const saved = await github(cfg, `/repos/${cfg.repo}/contents/${SITES_FILE}`, {
          method: 'PUT', body: { message: result.message, content: encodeBase64(updated), sha: file.sha, branch: BRANCH },
        });
        return reply(200, { ok: true, summary: result.summary, site: result.site || null, removed: result.removed || null,
          commitUrl: saved?.commit?.html_url || null });
      } catch (e) {
        // Someone else saved sites.js a moment ago: read it again and reapply.
        if ((e.githubStatus === 409 || e.githubStatus === 422) && attempt < 3) continue;
        throw e;
      }
    }
  } catch (e) { return failure(e); }
}
