(() => {
'use strict';
const REPO = 'BigChief-at-illuminathidotorg/Penn-News-Scraper';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/public/data/`;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = value => { try { const url=new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; } };
const label = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
async function read(url) { const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)}); if(!r.ok)throw Error(`HTTP ${r.status}`); return r.json(); }
async function firstAvailable(path) {
 const results=await Promise.allSettled([read(RAW+path),read(new URL(`data/${path}`,document.baseURI))]);
 return results.filter(r=>r.status==='fulfilled').map(r=>r.value);
}
function sourceURLs(site) { return [site.newsUrl,...(site.extraUrls||[])]; }
const params=new URLSearchParams(location.search);
let site, posts=[], archive=null, showing=50;
function filters() { return {q:$('query').value.trim().toLowerCase(),from:$('from').value,to:$('to').value,order:$('order').value}; }
function render() {
 const {q,from,to,order}=filters();
 let filtered=posts.filter(p=>p && typeof p.title==='string' && (!q || `${p.title} ${p.dek||''}`.toLowerCase().includes(q)) && (!from || p.date>=from) && (!to || p.date<=to));
 filtered.sort((a,b)=>order==='oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
 $('resultCount').textContent=`${filtered.length} ${filtered.length===1?'story':'stories'}${filtered.length!==posts.length?' match':' saved'}`;
 $('articles').innerHTML=filtered.slice(0,showing).map(p=>{
  const link=safeURL(p.link), title=escape(p.title);
  return `<article class="archive-item"><div>${link?`<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${title}</a>`:`<strong>${title}</strong>`}${p.dek?`<p>${escape(p.dek).slice(0,700)}</p>`:''}</div><time datetime="${escape(p.date||'')}">${p.undated?'Seen ':''}${label(p.date)}</time></article>`;
 }).join('') || '<p class="archive-empty">No saved stories match. Try a wider date range, or run an archive job to look further back.</p>';
 $('more').hidden=showing>=filtered.length;
 $('jobFrom').textContent=from || 'Leave blank (oldest reachable)';
 const url=new URL(location.href); for(const [key,value] of Object.entries({q,from,to,order}))value?url.searchParams.set(key,value):url.searchParams.delete(key);
 history.replaceState(null,'',url);
}
function metadata() {
 const dates=posts.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date) && !p.undated).map(p=>p.date).sort();
 $('total').textContent=posts.length;
 $('oldest').textContent=dates.length?label(dates[0]):'No dated stories';
 $('newest').textContent=dates.length?label(dates.at(-1)):'No dated stories';
 $('scan').textContent=archive?`${archive.pagesScanned||0} listing ${archive.pagesScanned===1?'page':'pages'}`:'Not run yet';
 $('archiveDetails').textContent=archive?`Last archive job: ${new Date(archive.lastScrapedAt).toLocaleString()}. ${[...(archive.stopReasons||[]),...(archive.warnings||[])].join(' · ')}`:'Showing the latest shared collection. Run the archive job to look beyond the regular source limit.';
}
async function init() {
 const [catalogs,snapshots]=await Promise.all([firstAvailable('sources.json'),firstAvailable('latest.json')]);
 const catalog=catalogs.filter(c=>Array.isArray(c.sites)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))[0];
 if(!catalog)throw Error('The source list could not be loaded. Please try again.');
 const all=catalog.sites.filter(s=>typeof s.id==='string' && /^[a-z0-9-]+$/.test(s.id));
 const id=params.get('id'); site=all.find(s=>s.id===id) || all[0];
 if(!site)throw Error('No source is configured.');
 $('sourcePicker').innerHTML=all.map(s=>`<option value="${escape(s.id)}">${escape(s.parentUnit||s.bucket||'Other')} · ${escape(s.name)}</option>`).join('');
 $('sourcePicker').value=site.id; $('sourcePicker').disabled=false;
 $('sourceTitle').textContent=site.name; $('unit').textContent=site.parentUnit||site.bucket||'SOURCE';
 $('sourceDescription').textContent=site.subhead||''; $('jobId').textContent=site.id;
 const url=safeURL(site.newsUrl||site.feedUrl); if(url){$('sourceLink').href=url;$('sourceLink').hidden=false;}
 document.title=`${site.name} archive · Penn News Monitor`;
 const snap=snapshots.filter(c=>Array.isArray(c.sites)).sort((a,b)=>Date.parse(b.lastRefreshAt)-Date.parse(a.lastRefreshAt))[0];
 const latest=snap?.sites?.find(s=>s.id===site.id);
 const archives=await firstAvailable(`archive/${site.id}.json`);
 archive=archives.filter(a=>a.id===site.id && JSON.stringify(a.listingUrls)===JSON.stringify(sourceURLs(site)) && Array.isArray(a.posts)).sort((a,b)=>Date.parse(b.lastScrapedAt)-Date.parse(a.lastScrapedAt))[0]||null;
 const live=latest?.newsUrl===site.newsUrl && JSON.stringify(latest?.extraUrls||[])===JSON.stringify(site.extraUrls||[]) ? latest.posts||[] : [];
 posts=[...(archive?.posts||[]),...live].filter(p=>p && typeof p.title==='string' && typeof p.date==='string' && (!p.link||safeURL(p.link)));
 posts=[...new Map(posts.map(p=>[p.link||`${p.title}|${p.date}`,p])).values()];
 $('status').textContent=archive?`Saved archive from ${new Date(archive.lastScrapedAt).toLocaleString()} plus the latest collection. Earliest captured is a discovery boundary, not the publisher's first story.`:'Showing stories from the regular collection. The archive has not been expanded for this source yet.';
 for(const key of ['q','from','to','order'])if(params.has(key))$(key==='q'?'query':key).value=params.get(key);
 metadata(); render();
}
for(const id of ['query','from','to','order'])$(id).addEventListener('input',()=>{showing=50;render();});
$('more').addEventListener('click',()=>{showing+=50;render();});
$('clearFilters').addEventListener('click',()=>{for(const id of ['query','from','to'])$(id).value='';$('order').value='newest';showing=50;render();});
$('sourcePicker').addEventListener('change',()=>{location.href=`archive.html?id=${encodeURIComponent($('sourcePicker').value)}`;});
$('copyJob').addEventListener('click',async()=>{
 const details=`Penn News Monitor archive job\nSource ID: ${site.id}\nEarliest date: ${$('from').value||'(leave blank for oldest reachable)'}\nPage limit: 25\n${$('jobLink').href}`;
 try{await navigator.clipboard.writeText(details);$('jobStatus').textContent='Copied. Open GitHub and enter these details under Run workflow.';}
 catch{$('jobStatus').textContent=`Enter source ID ${site.id} in GitHub. The date is optional.`;}
});
init().catch(error=>{$('status').textContent=error.message;});
})();
