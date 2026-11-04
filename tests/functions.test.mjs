// Tests for the Cloudflare Pages Functions behind "Check for updates" and the
// source editor. Run: node --test tests/functions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSitesJs, serializeSitesJs, applyChange, samePasscode, slugify,
  startRun, changeSources, sessionStatus, checkPasscode } from '../lib/monitor-api.mjs';

const SITES_JS = readFileSync(new URL('../sites.js', import.meta.url), 'utf8');
const ENV = { GITHUB_TOKEN: 'test-token', MONITOR_PASSCODE: 'correct horse battery', GITHUB_API: 'https://gh.test' };
const NOW = Date.parse('2026-11-05T15:00:00Z');
const doc = () => parseSitesJs(SITES_JS);
const ask = (path, { passcode = ENV.MONITOR_PASSCODE, body, origin = 'https://monitor.test' } = {}) =>
  new Request(`https://monitor.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(passcode ? { 'X-Monitor-Passcode': passcode } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const newSite = { name: 'Center for Testing', parentUnit: 'SAS', bucket: 'Center',
  newsUrl: 'https://testing.sas.upenn.edu/news', extraUrls: 'https://testing.sas.upenn.edu/press\n', subhead: 'Tests' };

// A stand-in for api.github.com that records what the functions ask for.
function fakeGitHub({ runs = [], text = SITES_JS, conflicts = 0 } = {}) {
  const calls = [];
  let file = text, sha = 'sha-1';
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method || 'GET';
    calls.push({ method, path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    const ok = (data, status = 200) => new Response(data === null ? null : JSON.stringify(data), { status });
    if (u.pathname.endsWith('/runs')) return ok({ workflow_runs: runs });
    if (u.pathname.endsWith('/dispatches')) return ok(null, 204);
    if (u.pathname.endsWith('/contents/sites.js') && method === 'GET') return ok({ sha, content: Buffer.from(file).toString('base64').replace(/(.{60})/g, '$1\n') });
    if (u.pathname.endsWith('/contents/sites.js') && method === 'PUT') {
      const body = JSON.parse(init.body);
      if (conflicts-- > 0) { sha = 'sha-2'; return ok({ message: 'sites.js does not match' }, 409); }
      assert.equal(body.sha, sha);
      file = Buffer.from(body.content, 'base64').toString('utf8');
      return ok({ commit: { html_url: 'https://github.com/x/commit/abc' } });
    }
    return ok({ message: 'Not Found' }, 404);
  };
  return { calls, file: () => file };
}

test('sites.js survives a read and write unchanged', () => {
  const d = doc();
  assert.equal(serializeSitesJs(d, d.sites.value, d.groups.value), SITES_JS);
  assert.ok(d.sites.value.length > 50);
});

test('adding a source: id, notes, order, checks', () => {
  const d = doc();
  const r = applyChange(d.sites.value, d.groups.value, { action: 'add', site: newSite, editor: 'Nathi' }, new Date(NOW));
  const s = r.sites.at(-1);
  assert.equal(s.id, 'center-for-testing');
  assert.deepEqual(Object.keys(s), ['id', 'name', 'parentUnit', 'bucket', 'subhead', 'newsUrl', 'extraUrls', 'magazineUrl', 'notes', 'posts', 'feedUrl']);
  assert.deepEqual(s.extraUrls, ['https://testing.sas.upenn.edu/press']);
  assert.equal(s.notes, '2026-11-05: Added from the monitor by Nathi.');
  assert.match(r.message, /^Add source: Center for Testing/);
  const gse = d.sites.value.find(x => x.id === 'gse');
  assert.throws(() => applyChange(d.sites.value, null, { action: 'add', site: { ...newSite, newsUrl: gse.newsUrl + '/' } }), /already read for GSE/);
  assert.throws(() => applyChange(d.sites.value, null, { action: 'add', site: { ...newSite, newsUrl: 'javascript:alert(1)' } }), /full web address/);
  assert.throws(() => applyChange(d.sites.value, null, { action: 'add', site: { ...newSite, newsUrl: '' } }), /required/);
  assert.throws(() => applyChange(d.sites.value, null, { action: 'add', site: { ...newSite, name: 'X' } }), /at least 2/);
  assert.throws(() => applyChange(d.sites.value, null, { action: 'add', site: { ...newSite, bucket: 'Spaceship' } }), /Type must be one of/);
  assert.equal(slugify('Penn Museum & Café'), 'penn-museum-and-cafe');
});

test('editing a source keeps untouched fields and addresses', () => {
  const d = doc();
  const seas = d.sites.value.find(x => x.id === 'seas');
  const edit = { ...seas, subhead: 'Engineering news', extraUrls: [] };
  const r = applyChange(d.sites.value, d.groups.value, { action: 'update', id: 'seas', site: edit }, new Date(NOW));
  const s = r.sites.find(x => x.id === 'seas');
  assert.equal(s.subhead, 'Engineering news');
  assert.equal(s.newsUrl, seas.newsUrl);
  assert.equal(s.exportName, 'Engineering');
  assert.equal(s.notes, seas.notes);
  assert.deepEqual(Object.keys(s), Object.keys(seas));
  assert.throws(() => applyChange(d.sites.value, null, { action: 'update', id: 'seas', site: seas }), /Nothing was changed/);
  const appc = d.sites.value.find(x => x.id === 'appc');
  const r2 = applyChange(d.sites.value, null, { action: 'update', id: 'appc', site: { ...appc, extraUrls: '' } });
  assert.equal('extraUrls' in r2.sites.find(x => x.id === 'appc'), false);
  assert.throws(() => applyChange(d.sites.value, null, { action: 'update', id: 'nope', site: appc }), /no longer in the list/);
});

test('removing a source also drops it from the groups', () => {
  const d = doc();
  const r = applyChange(d.sites.value, d.groups.value, { action: 'remove', id: 'snf-paideia-perspectives' });
  assert.equal(r.sites.some(s => s.id === 'snf-paideia-perspectives'), false);
  assert.equal(r.groups.some(g => g.sites.includes('snf-paideia-perspectives')), false);
  assert.equal(r.sites.length, d.sites.value.length - 1);
});

test('passcodes compare exactly', async () => {
  assert.equal(await samePasscode('correct horse battery', 'correct horse battery'), true);
  assert.equal(await samePasscode('correct horse batter', 'correct horse battery'), false);
  assert.equal(await samePasscode('', 'correct horse battery'), false);
});

test('setup status and passcode checks', async () => {
  assert.equal((await sessionStatus({}).json()).configured, false);
  assert.equal((await sessionStatus({ ...ENV, MONITOR_PASSCODE: 'short' }).json()).setup, 'weak-passcode');
  assert.equal((await sessionStatus(ENV).json()).configured, true);
  assert.equal((await checkPasscode(ask('/api/session'), ENV, { pause: 0 })).status, 200);
  assert.equal((await checkPasscode(ask('/api/session', { passcode: 'wrong guess here' }), ENV, { pause: 0 })).status, 401);
  assert.equal((await checkPasscode(ask('/api/session', { origin: 'https://evil.test' }), ENV, { pause: 0 })).status, 403);
  assert.equal((await checkPasscode(ask('/api/session'), {}, { pause: 0 })).status, 503);
});

test('Check for updates starts a collection only when needed', async () => {
  const minutesAgo = m => new Date(NOW - m * 60000).toISOString();
  let gh = fakeGitHub({ runs: [{ id: 1, status: 'in_progress', conclusion: null, updated_at: minutesAgo(1) }] });
  let res = await startRun(ask('/api/run'), ENV, { now: NOW, pause: 0 });
  assert.equal((await res.json()).state, 'running');
  assert.equal(gh.calls.some(c => c.path.endsWith('/dispatches')), false);

  gh = fakeGitHub({ runs: [{ id: 2, status: 'completed', conclusion: 'success', updated_at: minutesAgo(3) }] });
  res = await startRun(ask('/api/run'), ENV, { now: NOW, pause: 0 });
  assert.deepEqual([(await res.clone().json()).state, (await res.json()).minutesAgo], ['recent', 3]);

  gh = fakeGitHub({ runs: [{ id: 3, status: 'completed', conclusion: 'failure', updated_at: minutesAgo(2) }] });
  res = await startRun(ask('/api/run'), ENV, { now: NOW, pause: 0 });
  assert.equal(res.status, 202);
  const dispatch = gh.calls.find(c => c.path.endsWith('/dispatches'));
  assert.deepEqual(dispatch.body, { ref: 'main' });
  assert.equal(dispatch.auth, 'Bearer test-token');

  gh = fakeGitHub({ runs: [{ id: 4, status: 'completed', conclusion: 'success', updated_at: minutesAgo(45) }] });
  assert.equal((await startRun(ask('/api/run'), ENV, { now: NOW, pause: 0 })).status, 202);

  gh = fakeGitHub();
  res = await startRun(ask('/api/run', { passcode: 'not the passcode' }), ENV, { now: NOW, pause: 0 });
  assert.equal(res.status, 401);
  assert.equal(gh.calls.length, 0, 'GitHub is never called without the passcode');
});

test('a saved change rewrites only what changed in sites.js', async () => {
  const gh = fakeGitHub({ conflicts: 1 });
  const res = await changeSources(ask('/api/sources', { body: { action: 'add', site: newSite, editor: 'Nathi' } }), ENV, { now: new Date(NOW), pause: 0 });
  const out = await res.json();
  assert.equal(res.status, 200, out.error);
  assert.equal(out.site.id, 'center-for-testing');
  const puts = gh.calls.filter(c => c.method === 'PUT');
  assert.equal(puts.length, 2, 'retried after a conflicting save');
  assert.match(puts[1].body.message, /^Add source: Center for Testing\n\nAdded from the monitor by Nathi\./);
  const after = parseSitesJs(gh.file());
  assert.equal(after.sites.value.length, doc().sites.value.length + 1);
  assert.equal(serializeSitesJs(after, doc().sites.value, after.groups.value), SITES_JS, 'everything else is byte-for-byte the same');

  const bad = await changeSources(ask('/api/sources', { body: { action: 'add', site: { ...newSite, newsUrl: 'ftp://x' } } }), ENV, { pause: 0 });
  assert.equal(bad.status, 400);
});
