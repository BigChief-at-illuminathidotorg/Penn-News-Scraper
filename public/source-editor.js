/* Simple source form. GitHub remains the place where changes are authorized and saved. */
(() => {
  'use strict';
  const REPO = 'BigChief-at-illuminathidotorg/Penn-News-Scraper';
  const RAW = `https://raw.githubusercontent.com/${REPO}/main/sites.js`;
  const $ = id => document.getElementById(id);
  let revision = '', staffReady = false;
  let sites = [], groups = [], original = '', current = null, unsavedForm = false, copied = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const slug = name => name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
  const url = value => { if (!value) return ''; const parsed = new URL(value.trim()); if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw Error(`Check this address: ${value}`); return parsed.href; };
  const mark = message => { $('editorStatus').textContent = message; };

  function arrayAfter(raw, marker) {
    const assignment = raw.indexOf(marker);
    if (assignment < 0) throw Error(`Missing ${marker} in the source list.`);
    const start = raw.indexOf('[', assignment + marker.length);
    if (start < 0) throw Error('The source list could not be read.');
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < raw.length; i++) {
      const char = raw[i];
      if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
      else if (char === '"') quoted = true;
      else if (char === '[') depth++;
      else if (char === ']' && --depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
    throw Error('The source list is incomplete.');
  }

  function renderList() {
    const query = $('sourceSearch').value.trim().toLowerCase();
    const matches = sites.map((site, index) => ({site, index})).filter(({site}) => `${site.name} ${site.parentUnit} ${site.newsUrl} ${(site.extraUrls || []).join(' ')}`.toLowerCase().includes(query));
    matches.sort((a, b) => (a.site.parentUnit || '').localeCompare(b.site.parentUnit || '') || a.site.name.localeCompare(b.site.name));
    $('sourceTotal').textContent = `${matches.length} of ${sites.length} sources`;
    const list = $('editorList'); list.replaceChildren();
    for (const {site, index} of matches) {
      const item = document.createElement('button'); item.type = 'button';
      item.className = 'editor-row' + (current === index ? ' selected' : '');
      const name = document.createElement('strong'); name.textContent = site.name;
      const detail = document.createElement('span'); detail.textContent = `${site.parentUnit || 'Penn'} · ${site.newsUrl || 'No address'}`;
      item.append(name, detail); item.onclick = () => choose(index); list.append(item);
    }
    if (!matches.length) list.textContent = 'No matching sources.';
    const changes = JSON.stringify({sites, groups}) !== original;
    $('copySites').disabled = !changes;
    $('publishSources').disabled = !changes || !staffReady;
    $('openGitHub').setAttribute('aria-disabled', String(!changes));
    $('changeSummary').textContent = changes ? 'Draft ready. Save changes below to update the monitor.' : 'No changes yet.';
  }

  function groupFor(id) { return groups.find(group => group.sites.includes(id))?.id || ''; }
  function choose(index) {
    if (unsavedForm && !confirm('Discard the unsaved changes in this form?')) return;
    current = index; unsavedForm = false;
    const site = sites[index];
    $('emptyEditor').hidden = true; $('sourceForm').hidden = false;
    $('formTitle').textContent = site ? `Edit ${site.name}` : 'Add a source';
    $('removeSource').hidden = !site;
    $('siteName').value = site?.name || '';
    $('siteUrl').value = site?.newsUrl || '';
    $('siteExtra').value = (site?.extraUrls || []).join('\n');
    $('siteUnit').value = site?.parentUnit || 'Penn';
    $('siteBucket').value = site?.bucket && [...$('siteBucket').options].some(option => option.value === site.bucket) ? site.bucket : 'Other';
    $('siteGroup').value = site ? groupFor(site.id) : '';
    $('siteSubhead').value = site?.subhead || '';
    $('siteFeed').value = site?.feedUrl || '';
    $('siteMagazine').value = site?.magazineUrl || '';
    $('siteNotes').value = site?.notes || '';
    renderList();
    if (!site) $('siteName').focus();
  }

  function save(event) {
    event.preventDefault();
    try {
      const name = $('siteName').value.trim();
      const newsUrl = url($('siteUrl').value);
      if (!name || !newsUrl) throw Error('Enter a source name and news page.');
      const extraUrls = [...new Set($('siteExtra').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(url))].filter(link => link !== newsUrl);
      const feedUrl = url($('siteFeed').value), magazineUrl = url($('siteMagazine').value);
      const others = sites.filter((_, index) => index !== current);
      if (others.some(s => [s.newsUrl, ...(s.extraUrls || [])].includes(newsUrl))) throw Error('That news page is already in another source.');
      const previous = sites[current];
      let id = previous?.id || slug(name), count = 2;
      while (!previous && sites.some(site => site.id === id)) id = `${slug(name)}-${count++}`;
      const site = previous ? clone(previous) : {id, posts: []};
      Object.assign(site, {name, parentUnit: $('siteUnit').value.trim() || 'Penn', bucket: $('siteBucket').value, subhead: $('siteSubhead').value.trim(), newsUrl, magazineUrl: magazineUrl || null, notes: $('siteNotes').value.trim(), feedUrl: feedUrl || null});
      if (extraUrls.length) site.extraUrls = extraUrls; else delete site.extraUrls;
      if (!previous) { current = sites.length; sites.push(site); } else sites[current] = site;
      const chosen = $('siteGroup').value;
      // An unchanged group retains any additional section memberships.
      if (!previous || chosen !== groupFor(id)) {
        for (const group of groups) group.sites = group.sites.filter(member => member !== id);
        const group = groups.find(group => group.id === chosen);
        if (group) group.sites.push(id);
      }
      copied = false; unsavedForm = false; choose(current); mark(`${name} saved to this draft. Publish the changes below when ready.`);
    } catch (error) { mark(error.message); }
  }

  function sourceText() {
    return '// PENN NEWS MONITOR - SITE LIST\n// Single source of truth for the dashboard and scraper.\n// Use the monitor source editor to add or change news pages.\n\n' +
      `window.PENN_MONITOR_DEFAULT_SITES = ${JSON.stringify(sites, null, 2)};\n\n` +
      `window.PENN_MONITOR_GROUPS = ${JSON.stringify(groups, null, 2)};\n`;
  }

  async function copyDraft() {
    const content = sourceText();
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      $('copyStatus').textContent = 'Copied. Open GitHub, click in the file, press ⌘A (Mac) or Ctrl+A (Windows), paste, then Commit changes.';
      $('manualCopy').hidden = $('manualCopyLabel').hidden = true;
    } catch {
      copied = true;
      $('manualCopy').value = content; $('manualCopy').hidden = $('manualCopyLabel').hidden = false;
      $('manualCopy').focus(); $('manualCopy').select();
      $('copyStatus').textContent = 'Clipboard access is blocked. Copy the selected text here, then paste it into the GitHub editor.';
    }
  }

  $('sourceSearch').oninput = renderList;
  $('newSource').onclick = () => choose(sites.length);
  $('sourceForm').oninput = () => { unsavedForm = true; };
  $('sourceForm').onsubmit = save;
  $('removeSource').onclick = () => {
    const site = sites[current]; if (!site || !confirm(`Remove ${site.name} from the source list?`)) return;
    sites.splice(current, 1); for (const group of groups) group.sites = group.sites.filter(id => id !== site.id);
    current = null; unsavedForm = false; copied = false; $('sourceForm').hidden = true; $('emptyEditor').hidden = false;
    renderList(); mark(`${site.name} removed from this draft. Publish the changes below when ready.`);
  };
  $('copySites').onclick = copyDraft;
  $('publishSources').onclick = async () => {
    if (unsavedForm) { mark('Save the current form to the draft first.'); return; }
    $('publishSources').disabled = true;
    try {
      const result = await StaffAPI('sources', {sites, groups, sha:revision});
      revision = result.sha; original = JSON.stringify({sites, groups}); copied = true;
      $('publishStatus').textContent = 'Saved. A collection will start on GitHub. Follow progress on Manage scraper.'; renderList();
    } catch(error) { $('publishStatus').textContent = error.message; renderList(); }
  };
  window.addEventListener('beforeunload', event => { if (unsavedForm || !copied && JSON.stringify({sites, groups}) !== original && original) { event.preventDefault(); event.returnValue = ''; } });

  (async () => {
    try {
      try {
        const config=await StaffAPI('config');
        if(config.ready){const session=await StaffAPI('session');staffReady=session.approved;}
        if(staffReady){const state=await StaffAPI('sources');revision=state.sha;sites=state.sites;groups=state.groups;}
      } catch { staffReady=false; }
      $('publishStatus').textContent=staffReady?'Signed in. You can publish changes directly.':'Sign in and request approval on Manage scraper to publish directly. The GitHub editor remains available.';
      const response = await fetch(RAW, {cache: 'no-store'});
      if (!response.ok) throw Error(`GitHub returned HTTP ${response.status}.`);
      const raw = await response.text();
      if(!staffReady)sites = arrayAfter(raw, 'window.PENN_MONITOR_DEFAULT_SITES');
      if(!staffReady)groups = arrayAfter(raw, 'window.PENN_MONITOR_GROUPS');
      if (!Array.isArray(sites) || !sites.length || !Array.isArray(groups)) throw Error('The source list format is invalid.');
      original = JSON.stringify({sites, groups});
      $('unitSuggestions').replaceChildren(...[...new Set(sites.map(site => site.parentUnit).filter(Boolean))].sort().map(unit => { const option = document.createElement('option'); option.value = unit; return option; }));
      $('siteGroup').replaceChildren(...[{id: '', label: 'No section'}, ...groups].map(group => { const option = document.createElement('option'); option.value = group.id; option.textContent = group.label; return option; }));
      $('newSource').disabled = $('sourceSearch').disabled = false;
      renderList(); mark('Current source list loaded from GitHub.');
      const requested = new URL(location.href).searchParams.get('id');
      const index = sites.findIndex(site => site.id === requested); if (index >= 0) choose(index);
    } catch (error) { mark(`Could not load the current list from GitHub: ${error.message} Please reload this page.`); }
  })();
})();

