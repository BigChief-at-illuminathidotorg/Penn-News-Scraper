/* Penn News Monitor 3.1. Public read-only integration; no credentials in the browser. */
(() => {
'use strict';
const REPO = 'BigChief-at-illuminathidotorg/Penn-News-Scraper';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/public/data/latest.json`;
const JOBS = `https://api.github.com/repos/${REPO}/actions/workflows/collect.yml/runs?branch=main&per_page=1`;
const ACTIONS = `https://github.com/${REPO}/actions/workflows/collect.yml`;
const KEY = 'penn-monitor-v3';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(value) { try { const u=new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } }
function text(value) { return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function calendarDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T12:00:00') : new Date(value); }
function dateLabel(value) { const d=calendarDate(value); return Number.isFinite(+d) ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable'; }
function timeLabel(value) { const d=new Date(value); return Number.isFinite(+d) ? d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Unknown'; }
function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekBounds(value) { const d=calendarDate(value); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); const end=new Date(d);end.setDate(end.getDate()+7);return [d,end]; }
function validate(data) {
 if(!data || !Array.isArray(data.sites) || !data.sites.length || !Number.isFinite(Date.parse(data.lastRefreshAt))) throw Error('This file is not a valid monitor snapshot.');
 const seen=new Set();
 for(const s of data.sites) { if(!s || typeof s.id!=='string' || seen.has(s.id) || typeof s.name!=='string' || !Array.isArray(s.posts)) throw Error('A source entry is invalid.');seen.add(s.id);for(const p of s.posts)if(!p || typeof p.title!=='string' || (p.link && !safeURL(p.link)))throw Error('An article contains an invalid link.'); }
 return data;
}
let catalog=null;
let snapshot=null, imported=false, loading=false, generation=0, job=null, source='', lastChecked='', message='', loadWarning='';
let prefs={theme:'light',compact:false};
try { prefs={...prefs,...JSON.parse(localStorage.getItem(KEY+'-prefs')||'{}')};const cached=JSON.parse(localStorage.getItem(KEY)||'null');if(cached){snapshot=validate(cached.data);imported=!!cached.imported;source=imported?'Imported file':'Browser cache';} } catch { /* An invalid cache must not prevent loading. */ }
function save() { try{localStorage.setItem(KEY,JSON.stringify({data:snapshot,imported}));}catch{/* Large snapshots remain usable in memory. */} }
function savePrefs(){try{localStorage.setItem(KEY+'-prefs',JSON.stringify(prefs));}catch{} }
function applyPrefs(){document.body.classList.toggle('dark',prefs.theme==='dark');document.body.classList.toggle('compact',!!prefs.compact);$('theme').textContent=prefs.theme==='dark'?'Day mode':'Night mode';$('compact').setAttribute('aria-pressed',String(!!prefs.compact));}
function viewSites(){
 if(imported || !catalog)return snapshot?.sites||[];
 const old=new Map((snapshot?.sites||[]).map(s=>[s.id,s]));
 return catalog.sites.map(c=>{const prior=old.get(c.id);if(prior && prior.newsUrl===c.newsUrl)return {...prior,...c};return {...c,posts:[],lastSyncAt:'',lastError:'Awaiting collection at this source address.'};});
}
function validateCatalog(c){if(!c || !Array.isArray(c.sites) || !c.sites.length || !Number.isFinite(Date.parse(c.publishedAt)) || new Set(c.sites.map(s=>s.id)).size!==c.sites.length || c.sites.some(s=>typeof s.id!=='string'||typeof s.name!=='string'))throw Error('Invalid source catalog');return c;}
function renderStatus(){
 $('collectionTime').textContent=snapshot?timeLabel(snapshot.lastRefreshAt):'No collection loaded';
 $('connection').textContent=message || (snapshot?`${source}. Last checked ${lastChecked || 'not yet'}.`:'Waiting for published data.');
 $('refresh').disabled=loading;$('refresh').textContent=loading?'Checking…':imported?'Return to online collection':'Check for updates';
 const issues=snapshot?viewSites().filter(s=>s.lastError||!s.newsUrl).length:0;
 $('sourceCount').textContent=snapshot?`${viewSites().length-issues} of ${viewSites().length} without warnings`:'—';
 const notices=[];
 if(imported)notices.push('You are viewing an imported file. Automatic updates are paused. Return to the online collection to resume.');
 else if(snapshot && Date.now()-Date.parse(snapshot.lastRefreshAt)>36*3600000)notices.push('This collection is more than 36 hours old. There are no scheduled collections on weekends. Check the GitHub job if a weekday update is missing.');
 if(loadWarning)notices.push(loadWarning);
 if(!imported && job?.conclusion==='failure')notices.push('The latest GitHub run failed. The last published collection is still available. Open GitHub for the failed step.');
 $('notice').hidden=!notices.length;$('notice').textContent=notices.join(' ');
}
function sectionOptions(){const old=$('section').value;const values=[...new Set(viewSites().map(s=>s.parentUnit||s.bucket||'Other'))].sort();$('section').innerHTML='<option value="">All sections</option>'+values.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');if(values.includes(old))$('section').value=old;}
function render(){
 renderStatus();
 if(!snapshot){$('stories').innerHTML='<div class="empty">No news loaded yet. Check for updates, or import a saved snapshot.</div>';$('results').textContent='No collection';return;}
 const query=$('search').value.trim().toLowerCase(),section=$('section').value,week=$('week').value;
 const bounds=week?weekBounds(week):null;let count=0,shown=0;
 const html=viewSites().map(s=>{
  if(section && (s.parentUnit||s.bucket||'Other')!==section)return '';
  const sourceMatch=[s.name,s.bucket,s.parentUnit,s.subhead].join(' ').toLowerCase().includes(query);
  const posts=s.posts.filter(p=>{const d=calendarDate(p.date);return (!bounds || (d>=bounds[0]&&d<bounds[1])) && (!query || sourceMatch || `${p.title} ${text(p.dek)}`.toLowerCase().includes(query));}).sort((a,b)=>(+calendarDate(b.date)||0)-(+calendarDate(a.date)||0));
  if((query&&!sourceMatch&&!posts.length)||($('active').checked&&!posts.length))return '';
  count+=posts.length;shown++;
  const url=safeURL(s.newsUrl);const warning=s.lastError || (!url?'No news URL configured.':'');
  return `<section class="desk"><div><p class="eyebrow">${escape(s.parentUnit||s.bucket||'SOURCE')}</p><h3>${escape(s.name)}</h3><span class="badge ${warning?'warn':''}">${warning?'NEEDS ATTENTION':'COLLECTED'}</span><p class="meta">Last source check<br>${s.lastSyncAt?escape(timeLabel(s.lastSyncAt)):'Not available'}</p>${url?`<a class="meta" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Visit source ↗</a>`:''}${warning?`<details class="deskdetails"><summary class="warning">Source warning</summary><p class="warning">${escape(warning)}</p></details>`:''}</div><div>${posts.length?posts.map(p=>{const link=safeURL(p.link);return `<article class="story"><div>${link?`<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${escape(p.title)}</a>`:`<strong>${escape(p.title)}</strong>`}${p.dek?`<p>${escape(text(p.dek)).slice(0,700)}</p>`:''}</div><time>${escape(dateLabel(p.date))}</time></article>`;}).join(''):'<p class="meta">No articles match this view. Try All dates or visit the source.</p>'}</div></section>`;
 }).join('');
 $('results').textContent=`${count} articles · ${shown} sources${week?' · Week of '+dateLabel(localDate(bounds[0])):' · All collected dates'}`;
 $('stories').innerHTML=html||'<div class="empty">Nothing matches these filters. Try another search or All dates.</div>';
}
async function readJSON(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();}
async function refresh(force=false){
 if(loading || (imported&&!force))return;
 const token=++generation;loading=true;message='Checking GitHub and this deployment…';renderStatus();
 const results=await Promise.allSettled([readJSON(RAW).then(validate),readJSON(new URL('data/latest.json',document.baseURI)).then(validate),readJSON(RAW.replace('latest.json','sources.json')).then(validateCatalog),readJSON(new URL('data/sources.json',document.baseURI)).then(validateCatalog)]);
 if(token!==generation)return;
 const catalogs=results.slice(2).filter(r=>r.status==='fulfilled').map(r=>r.value).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));if(catalogs.length && (!catalog||Date.parse(catalogs[0].publishedAt)>=Date.parse(catalog.publishedAt)))catalog=catalogs[0];
 const candidates=results.slice(0,2).flatMap((r,i)=>r.status==='fulfilled'?[{data:r.value,source:i===0?'GitHub shared collection':'This deployment'}]:[]).sort((a,b)=>Date.parse(b.data.lastRefreshAt)-Date.parse(a.data.lastRefreshAt));
 loading=false;lastChecked=timeLabel(new Date().toISOString());
 if(candidates.length){const best=candidates[0];if(!snapshot||imported||Date.parse(best.data.lastRefreshAt)>=Date.parse(snapshot.lastRefreshAt)){snapshot=best.data;source=best.source;imported=false;save();}message=`${source}. Checked ${lastChecked}.`;loadWarning=results[0].status==='rejected'?'GitHub data could not be reached; showing the latest available saved or deployed collection.':'';sectionOptions();}
 else {message='Unable to reach published data. Your current view has been kept.';loadWarning='Check your connection, try again, or use Import. No newer collection was confirmed.';}
 render();
}
async function checkJob(){
 $('checkJob').disabled=true;$('jobStatus').textContent='Checking GitHub…';
 try { const data=await readJSON(JOBS);const run=data.workflow_runs?.[0];if(!run)throw Error('No runs');job=run;
 const state=run.status==='completed'?(run.conclusion==='success'?'Succeeded':run.conclusion==='failure'?'Failed':run.conclusion):run.status.replaceAll('_',' ');
 $('jobStatus').textContent=`${state} · ${timeLabel(run.updated_at)}. Job status is separate from the collection timestamp.`;
 const url=safeURL(run.html_url);if(url && new URL(url).hostname==='github.com')$('jobLink').href=url;
 }catch{$('jobStatus').textContent='Job status unavailable (connection, permissions, or GitHub rate limit). Open GitHub to check.';}finally{$('checkJob').disabled=false;renderStatus();}
}
$('today').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
$('jobLink').href=ACTIONS;$('week').value='';$('active').checked=true;
$('refresh').onclick=()=>refresh(true);$('checkJob').onclick=checkJob;
$('search').oninput=render;$('section').onchange=render;$('week').onchange=render;$('active').onchange=render;
$('allDates').onclick=()=>{$('week').value='';render();};$('thisWeek').onclick=()=>{$('week').value=localDate(new Date());render();};
$('compact').onclick=()=>{prefs.compact=!prefs.compact;savePrefs();applyPrefs();};$('theme').onclick=()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';savePrefs();applyPrefs();};
$('sources').onclick=()=>{ $('sourceList').innerHTML=viewSites().map(s=>{const u=safeURL(s.newsUrl);return `<div class="source"><strong>${escape(s.name)}</strong><p>${u?`<a href="${escape(u)}" target="_blank" rel="noopener noreferrer">${escape(u)}</a>`:'No news URL configured'}</p><small>${s.posts.length} saved articles · Last source check ${s.lastSyncAt?escape(timeLabel(s.lastSyncAt)):'unavailable'}</small><p class="warning">${escape(s.lastError||'No collection warning reported.')}</p></div>`;}).join('')||'No collection loaded.';$('sourceDialog').showModal();};$('closeSources').onclick=()=>$('sourceDialog').close();
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Choose a snapshot smaller than 20 MB.');const data=validate(JSON.parse(await file.text()));generation++;loading=false;snapshot=data;imported=true;source='Imported file';message='Imported snapshot. Automatic updates are paused.';loadWarning='';save();sectionOptions();render();}catch(error){alert('Import failed: '+error.message);}finally{e.target.value='';}};
$('export').onclick=()=>{if(!snapshot){alert('Load a collection before exporting.');return;}const url=URL.createObjectURL(new Blob([JSON.stringify({...snapshot,sites:viewSites()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`penn-news-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
applyPrefs();sectionOptions();render();refresh();setInterval(()=>refresh(),5*60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
