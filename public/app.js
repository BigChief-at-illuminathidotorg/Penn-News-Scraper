/* Penn News Monitor 3.4. Reads public data. GitHub signs in people who run the
   collector or edit its source list; this public page never asks for a passcode. */
(() => {
'use strict';
const REPO = 'BigChief-at-illuminathidotorg/Penn-News-Scraper';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/public/data/latest.json`;
const JOBS = `https://api.github.com/repos/${REPO}/actions/workflows/collect.yml/runs?branch=main&per_page=1`;
const ACTIONS = `https://github.com/${REPO}/actions/workflows/collect.yml`;
const SITES_EDITOR = 'source-editor.html';
const KEY = 'penn-monitor-v3';
const BUCKETS = ['School','Center','Department','Institute','Program','Unit','Affiliate','House','Lab','Gallery','Museum','Library'];
const CATALOG_FIELDS = ['id','name','exportName','parentUnit','bucket','subhead','newsUrl','extraUrls','magazineUrl','notes','feedUrl'];
const win = typeof window === 'undefined' ? null : window;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(value) { try { const u=new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } }
function text(value) { return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function calendarDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value+'T12:00:00') : new Date(value); }
function dateLabel(value) { const d=calendarDate(value); return Number.isFinite(+d) ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable'; }
function timeLabel(value) { const d=new Date(value); return Number.isFinite(+d) ? d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'Unknown'; }
function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekBounds(value) { const d=calendarDate(value); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); const end=new Date(d);end.setDate(end.getDate()+7);return [d,end]; }
function weekText(value) {
 if(!value)return 'All dates';
 const [start,end]=weekBounds(value),last=new Date(end);last.setDate(last.getDate()-1);
 const month=d=>d.toLocaleDateString('en-US',{month:'short'});
 return start.getMonth()===last.getMonth()?`${month(start)} ${start.getDate()} – ${last.getDate()}`:`${month(start)} ${start.getDate()} – ${month(last)} ${last.getDate()}`;
}
function moveWeek(direction) {
 const selected=$('week').value;
 const start=weekBounds(selected || localDate(new Date()))[0];
 if(selected || direction<0)start.setDate(start.getDate()+direction*7);
 const current=weekBounds(localDate(new Date()))[0];
 if(start>current)start.setTime(current.getTime());
 $('week').value=localDate(start);
 render();
}
function updateWeekButtons() {
 const selected=$('week').value;
 const current=weekBounds(localDate(new Date()))[0];
 const atNewest=!!selected && weekBounds(selected)[0]>=current;
 $('nextWeek').disabled=atNewest;$('dockNext').disabled=atNewest;
 $('dockWeek').textContent=weekText(selected);
}
function validate(data) {
 if(!data || !Array.isArray(data.sites) || !data.sites.length || !Number.isFinite(Date.parse(data.lastRefreshAt))) throw Error('This file is not a valid monitor snapshot.');
 const seen=new Set();
 for(const s of data.sites) { if(!s || typeof s.id!=='string' || seen.has(s.id) || typeof s.name!=='string' || !Array.isArray(s.posts)) throw Error('A source entry is invalid.');seen.add(s.id);for(const p of s.posts)if(!p || typeof p.title!=='string' || (p.link && !safeURL(p.link)))throw Error('An article contains an invalid link.'); }
 return data;
}
let catalog=null;
let snapshot=null, imported=false, loading=false, generation=0, job=null, source='', lastChecked='', message='', loadWarning='';
let prefs={theme:'light',compact:false};
let picked=new Map(), shownStories=[], schoolOrder=[];
let watching=null;
try { prefs={...prefs,...JSON.parse(localStorage.getItem(KEY+'-prefs')||'{}')};const cached=JSON.parse(localStorage.getItem(KEY)||'null');if(cached){snapshot=validate(cached.data);imported=!!cached.imported;source=imported?'Imported file':'Browser cache';} } catch { /* An invalid cache must not prevent loading. */ }
try { for(const item of JSON.parse(localStorage.getItem(KEY+'-picked')||'[]'))if(item && item.key && safeURL(item.link))picked.set(item.key,item); } catch { /* Selections are a convenience only. */ }
function save() { try{localStorage.setItem(KEY,JSON.stringify({data:snapshot,imported}));}catch{/* Large snapshots remain usable in memory. */} }
function savePrefs(){try{localStorage.setItem(KEY+'-prefs',JSON.stringify(prefs));}catch{} }
function savePicked(){try{localStorage.setItem(KEY+'-picked',JSON.stringify([...picked.values()]));}catch{} }
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
const schoolOf=s=>s.parentUnit||s.bucket||'Other';
const slug=v=>String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'other';
const pickKey=(s,p)=>`${s.id}|${p.link||p.title}`;
function sectionOptions(){const old=$('section').value;const values=[...new Set(viewSites().map(schoolOf))].sort();$('section').innerHTML='<option value="">All sections</option>'+values.map(v=>`<option value="${escape(v)}">${escape(v)}</option>`).join('');if(values.includes(old))$('section').value=old;}

// ── Page: stories grouped by school, plus the index on the left ────────────
function storyHTML(s,p){
 const link=safeURL(p.link),key=pickKey(s,p),on=picked.has(key);
 return `<article class="story${on?' picked':''}"><label class="pick" title="Select for export"><input type="checkbox" data-key="${escape(key)}"${on?' checked':''}><span class="sr">Select “${escape(p.title)}” for export</span></label><div>${link?`<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${escape(p.title)}</a>`:`<strong>${escape(p.title)}</strong>`}${p.dek?`<p>${escape(text(p.dek)).slice(0,700)}</p>`:''}</div><time${p.undated?' title="This site shows no dates. This is the day the monitor first saw the story."':''}>${p.undated?'Seen ':''}${escape(dateLabel(p.date))}</time></article>`;
}
function deskHTML({s,posts}){
 const url=safeURL(s.newsUrl);const warning=s.lastError || (!url?'No news URL configured.':'');
 return `<section class="desk" id="desk-${escape(s.id)}" data-school="${escape(slug(schoolOf(s)))}"><div><p class="eyebrow">${escape(schoolOf(s))}</p><h3>${escape(s.name)}</h3><span class="badge ${warning?'warn':''}">${warning?'NEEDS ATTENTION':'COLLECTED'}</span><p class="meta">Last source check<br>${s.lastSyncAt?escape(timeLabel(s.lastSyncAt)):'Not available'}</p>${url?`<a class="meta" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Visit source ↗</a>`:''}${warning?`<details class="deskdetails"><summary class="warning">Source warning</summary><p class="warning">${escape(warning)}</p></details>`:''}</div><div>${posts.length?posts.map(p=>storyHTML(s,p)).join(''):'<p class="meta">No articles match this view. Try All dates or visit the source.</p>'}</div></section>`;
}
function indexHTML(schools){
 if(!schools.length)return '';
 return `<p class="eyebrow">SCHOOLS AND SITES</p><ol class="index-schools">${schools.map(({name,rows})=>{
  const total=rows.reduce((n,r)=>n+(r.visible?r.posts.length:0),0),onPage=rows.some(r=>r.visible);
  return `<li class="index-school" data-school="${escape(slug(name))}">${onPage?`<a href="#school-${escape(slug(name))}">`:'<span class="off">'}<span class="label">${escape(name)}</span><span class="n">${total||''}</span>${onPage?'</a>':'</span>'}<ol class="index-sites">${rows.map(r=>r.visible
   ?`<li><a href="#desk-${escape(r.s.id)}" data-desk="desk-${escape(r.s.id)}"><span class="label">${escape(r.s.name)}</span><span class="n">${r.posts.length||''}</span></a></li>`
   :`<li><span class="off" title="No stories in this view"><span class="label">${escape(r.s.name)}</span></span></li>`).join('')}</ol></li>`;}).join('')}</ol>`;
}
function render(){
 renderStatus();
 updateWeekButtons();
 updatePicked();
 if(!snapshot){$('stories').innerHTML='<div class="empty">No news loaded yet. Check for updates, or import a saved snapshot.</div>';$('index').innerHTML='';$('results').textContent='No collection';shownStories=[];return;}
 const query=$('search').value.trim().toLowerCase(),section=$('section').value,week=$('week').value;
 const bounds=week?weekBounds(week):null;let count=0,shown=0;
 const bySchool=new Map();shownStories=[];
 for(const s of viewSites()){
  if(section && schoolOf(s)!==section)continue;
  const sourceMatch=[s.name,s.bucket,s.parentUnit,s.subhead].join(' ').toLowerCase().includes(query);
  const posts=s.posts.filter(p=>{const d=calendarDate(p.date);return (!bounds || (d>=bounds[0]&&d<bounds[1])) && (!query || sourceMatch || `${p.title} ${text(p.dek)}`.toLowerCase().includes(query));}).sort((a,b)=>(+calendarDate(b.date)||0)-(+calendarDate(a.date)||0));
  const visible=!((query&&!sourceMatch&&!posts.length)||($('active').checked&&!posts.length));
  if(!bySchool.has(schoolOf(s)))bySchool.set(schoolOf(s),[]);
  bySchool.get(schoolOf(s)).push({s,posts,visible});
  if(visible){count+=posts.length;shown++;for(const p of posts)shownStories.push({s,p});}
 }
 const schools=[...bySchool.keys()].sort((a,b)=>a.localeCompare(b)).map(name=>({name,rows:bySchool.get(name)}));
 schoolOrder=schools.map(({name})=>slug(name));
 const html=schools.map(({name,rows})=>{const visible=rows.filter(r=>r.visible);return visible.length?`<section class="school" id="school-${escape(slug(name))}"><h2 class="school-name">${escape(name)}</h2>${visible.map(deskHTML).join('')}</section>`:'';}).join('');
 $('results').textContent=`${count} articles · ${shown} sources${week?' · Week of '+dateLabel(localDate(bounds[0])):' · All collected dates'}`;
 $('stories').innerHTML=html||'<div class="empty">Nothing matches these filters. Try another search or All dates.</div>';
 $('index').innerHTML=indexHTML(schools);
 followIndex();
}

// ── Index follows the reader ───────────────────────────────────────────────
let deskWatcher=null;
function markActive(deskId){
 const index=$('index');if(!index.querySelectorAll)return;
 index.querySelectorAll('.active').forEach(el=>el.classList.remove('active'));
 const link=index.querySelector(`a[data-desk="${deskId}"]`);if(!link)return;
 link.classList.add('active');link.closest('.index-school')?.classList.add('active');
 const top=link.offsetTop,bottom=top+link.offsetHeight;   // keep it in view inside the index only
 if(top<index.scrollTop+40)index.scrollTop=Math.max(0,top-40);
 else if(bottom>index.scrollTop+index.clientHeight-40)index.scrollTop=bottom-index.clientHeight+40;
}
function followIndex(){
 if(!win || !win.IntersectionObserver || !document.querySelectorAll)return;
 deskWatcher?.disconnect();
 deskWatcher=new IntersectionObserver(entries=>{const hit=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(hit)markActive(hit.target.id);},{rootMargin:'-15% 0px -75% 0px'});
 document.querySelectorAll('.desk').forEach(d=>deskWatcher.observe(d));
}

// ── Week changes from the floating bar keep you at the same school ────────
function keepPlace(change){
 if(!win || !document.querySelectorAll){change();return;}
 const desks=[...document.querySelectorAll('.desk')],here=desks.find(d=>d.getBoundingClientRect().bottom>90);
 const offset=here?Math.max(0,here.getBoundingClientRect().top):0,order=schoolOrder.slice();
 change();
 if(!here)return;
 let target=$(here.id)||$('school-'+here.dataset.school);
 for(let i=order.indexOf(here.dataset.school)+1;!target && i>0 && i<order.length;i++)target=$('school-'+order[i]);
 if(target)win.scrollBy({top:target.getBoundingClientRect().top-offset,behavior:'instant'});
}

// ── Selecting stories and exporting them ──────────────────────────────────
function updatePicked(){
 const n=picked.size;
 $('export').textContent=n?`Export (${n})`:'Export';
 $('dockExport').hidden=!n;$('dockExport').textContent=`Export ${n}`;
}
function togglePick(key,on){
 const hit=shownStories.find(({s,p})=>pickKey(s,p)===key);
 if(on && hit){const {s,p}=hit;picked.set(key,{key,siteId:s.id,label:s.exportName||s.name,school:schoolOf(s),title:p.title,link:safeURL(p.link)||safeURL(s.newsUrl),date:p.date||''});}
 else picked.delete(key);
 savePicked();updatePicked();
}
function exportGroups(){
 const sites=viewSites(),order=new Map(sites.map((s,i)=>[s.id,i])),schools=new Map(sites.map(s=>[s.id,schoolOf(s)]));
 const items=[...picked.values()].sort((a,b)=>(schools.get(a.siteId)||a.school||'').localeCompare(schools.get(b.siteId)||b.school||'')||(order.get(a.siteId)??1e9)-(order.get(b.siteId)??1e9)||String(b.date).localeCompare(String(a.date)));
 const groups=[];
 for(const item of items){const last=groups[groups.length-1];if(last && last.siteId===item.siteId)last.items.push(item);else groups.push({siteId:item.siteId,label:item.label,items:[item]});}
 return groups;
}
// Plain text, laid out like the For Consideration email: tab-indented dash, link beneath.
function exportText(groups){return groups.map(g=>`From ${g.label}:\n`+g.items.map(i=>`\t- ${i.title}\n\t  ${i.link}`).join('\n')).join('\n\n\n')+'\n';}
// Rich version for pasting into Outlook, Gmail or Word: Georgia, linked addresses.
function exportHTML(groups){
 const gap='<p style="margin:0">&nbsp;</p><p style="margin:0">&nbsp;</p>';
 return `<div style="font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.4;color:#000">`+groups.map(g=>`<p style="margin:0">From ${escape(g.label)}:</p>`+g.items.map(i=>`<p style="margin:0 0 0 0.6in;text-indent:-0.12in">- ${escape(i.title)}<br><a href="${escape(i.link)}">${escape(i.link)}</a></p>`).join('')).join(gap)+'</div>';
}
function renderExport(){
 const groups=exportGroups(),n=picked.size;
 $('exportTitle').textContent=n?`${n} selected ${n===1?'story':'stories'}`:'Selected stories';
 $('exportHint').textContent=n?'Copy pastes into an email or document with working links. Download saves a plain text file.':'Check the box beside any headline to add it here, or select everything shown on the page.';
 $('exportPreview').innerHTML=n?exportHTML(groups):'';$('exportPreview').hidden=!n;
 $('copyExport').disabled=!n;$('downloadExport').disabled=!n;$('clearExport').disabled=!n;
 $('selectShown').textContent=shownStories.length?`Select all shown (${shownStories.length})`:'Select all shown';$('selectShown').disabled=!shownStories.length;
}
function exportStatus(msg){$('exportStatus').textContent=msg;}
async function copyExport(){
 const groups=exportGroups();if(!groups.length)return;
 const plain=exportText(groups),html=exportHTML(groups);
 try{
  if(win?.ClipboardItem && navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plain],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
  else await navigator.clipboard.writeText(plain);
  exportStatus('Copied. Paste it into your email or document.');
 }catch{
  const box=document.createElement('textarea');box.value=plain;document.body.appendChild(box);box.select();
  const ok=document.execCommand && document.execCommand('copy');box.remove();
  exportStatus(ok?'Copied as plain text.':'Your browser blocked copying. Use Download text file instead.');
 }
}
function downloadExport(){
 const groups=exportGroups();if(!groups.length)return;
 const url=URL.createObjectURL(new Blob([exportText(groups)],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`for-consideration-${localDate(new Date())}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 exportStatus('Saved to your downloads.');
}
function openExport(){exportStatus('');renderExport();$('exportDialog').showModal();}

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
function setJob(text){$('jobStatus').textContent=text;}
// Refresh the published data and take authorized editors to GitHub to start a job.
async function checkForUpdates(){
 if(!imported)window.open(ACTIONS,'_blank','noopener');
 await refresh(true);
 if(!imported)setJob('Showing published news. In GitHub, choose Run workflow → Run workflow. Return here when it finishes; this page checks for new results automatically.');
}
function watchCollection(state){
 if(watching)clearTimeout(watching.timer);
 const since=Date.parse(snapshot?.lastRefreshAt||'')||0,started=Date.now();
 watching={ticks:0,timer:0};
 setJob(state==='running'?'A collection is already running on GitHub. This page updates itself when it’s done, usually within five minutes.':'Collection started on GitHub. New results usually arrive within five minutes, and this page updates itself.');
 renderStatus();
 const tick=async()=>{
  if(!watching)return;watching.ticks++;
  await refresh();
  if(!watching)return;
  const stop=text=>{watching=null;setJob(text);renderStatus();};
  if(snapshot && Date.parse(snapshot.lastRefreshAt)>since)return stop(`Updated with the collection from ${timeLabel(snapshot.lastRefreshAt)}.`);
  if(Date.now()-started>25*60000)return stop('This collection is taking longer than usual. Check job status, or open GitHub.');
  if(watching.ticks%4===0){
   try{const run=(await readJSON(JOBS)).workflow_runs?.[0];
    if(run && run.status==='completed' && run.conclusion==='failure' && Date.parse(run.created_at)>=started-120000){job=run;return stop('The collection failed on GitHub. The last published news is still shown. Open GitHub to see which step failed.');}}
   catch{/* Rate limit or offline: keep waiting. */}
  }
  watching.timer=setTimeout(tick,30000);
 };
 watching.timer=setTimeout(tick,30000);
}

// ── Sources: view, add, edit, remove ──────────────────────────────────────
function sourceHTML(s,canEdit){
 const u=safeURL(s.newsUrl);
 return `<div class="source"><div class="source-head"><strong>${escape(s.name)}</strong>${canEdit?`<a class="source-edit" href="${SITES_EDITOR}?id=${encodeURIComponent(s.id)}">Edit source</a>`:''}</div><p>${u?`<a href="${escape(u)}" target="_blank" rel="noopener noreferrer">${escape(u)}</a>`:'No news URL configured'}</p>${(s.extraUrls||[]).map(safeURL).filter(Boolean).map(x=>`<p>Also reads <a href="${escape(x)}" target="_blank" rel="noopener noreferrer">${escape(x)}</a></p>`).join('')}<small>${escape(s.parentUnit||'')}${s.parentUnit?' · ':''}${s.posts.length} saved articles · Last source check ${s.lastSyncAt?escape(timeLabel(s.lastSyncAt)):'unavailable'}</small><p class="${s.lastError?'warning':'meta'}">${escape(s.lastError||'No collection warning reported.')}</p></div>`;
}
function renderSources(){
 $('addSource').hidden=!!imported;
 const query=$('sourceSearch').value.trim().toLowerCase();
 const sites=viewSites().filter(s=>`${s.name} ${s.parentUnit} ${s.newsUrl} ${(s.extraUrls||[]).join(' ')}`.toLowerCase().includes(query)).sort((a,b)=>schoolOf(a).localeCompare(schoolOf(b))||a.name.localeCompare(b.name));
 $('sourceList').innerHTML=sites.map(s=>sourceHTML(s,!imported)).join('')||'No matching sources.';
}
async function openSources(){
 $('sourcesStatus').textContent='';renderSources();$('sourceDialog').showModal();
 $('editState').hidden=!imported;
 $('editState').textContent=imported?'Return to the online collection to manage sources.':'';
}
$('today').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
$('jobLink').href=ACTIONS;$('week').value='';$('active').checked=true;
$('refresh').onclick=checkForUpdates;$('checkJob').onclick=checkJob;
$('search').oninput=render;$('section').onchange=render;$('week').onchange=render;$('active').onchange=render;
$('prevWeek').onclick=()=>moveWeek(-1);$('nextWeek').onclick=()=>moveWeek(1);
$('dockPrev').onclick=()=>keepPlace(()=>moveWeek(-1));$('dockNext').onclick=()=>keepPlace(()=>moveWeek(1));
$('toTop').onclick=()=>win?.scrollTo({top:0,behavior:win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
$('allDates').onclick=()=>{$('week').value='';render();};$('thisWeek').onclick=()=>{$('week').value=localDate(new Date());render();};
$('compact').onclick=()=>{prefs.compact=!prefs.compact;savePrefs();applyPrefs();};$('theme').onclick=()=>{prefs.theme=prefs.theme==='dark'?'light':'dark';savePrefs();applyPrefs();};
$('stories').onchange=e=>{const box=e.target;if(box?.dataset?.key===undefined)return;togglePick(box.dataset.key,box.checked);box.closest?.('.story')?.classList.toggle('picked',box.checked);};
$('export').onclick=openExport;$('dockExport').onclick=openExport;$('closeExport').onclick=()=>$('exportDialog').close();
$('copyExport').onclick=copyExport;$('downloadExport').onclick=downloadExport;
$('selectShown').onclick=()=>{for(const {s,p} of shownStories)togglePick(pickKey(s,p),true);render();renderExport();exportStatus('');};
$('clearExport').onclick=()=>{picked.clear();savePicked();render();renderExport();exportStatus('Selection cleared.');};
$('sources').onclick=openSources;$('closeSources').onclick=()=>$('sourceDialog').close();
$('sourceSearch').oninput=renderSources;
$('addSource').onclick=()=>{window.location.href=SITES_EDITOR;};
$('import').onclick=()=>$('file').click();
$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Choose a snapshot smaller than 20 MB.');const data=validate(JSON.parse(await file.text()));generation++;loading=false;snapshot=data;imported=true;source='Imported file';message='Imported snapshot. Automatic updates are paused.';loadWarning='';save();sectionOptions();render();}catch(error){alert('Import failed: '+error.message);}finally{e.target.value='';}};
// The floating bar (week arrows, Export, back to top) fades in once the filters scroll away.
function checkDepth(){
 const deep=$('filterbar').getBoundingClientRect().bottom<0;
 if(deep===document.body.classList.contains('deep'))return;
 document.body.classList.toggle('deep',deep);$('dock').inert=!deep;
 if(!deep){const index=$('index');index.scrollTop=0;index.querySelectorAll?.('.active').forEach(el=>el.classList.remove('active'));}
}
if(win){let queued=false;win.addEventListener('scroll',()=>{if(!queued){queued=true;win.requestAnimationFrame(()=>{queued=false;checkDepth();});}},{passive:true});win.addEventListener('resize',checkDepth);$('dock').inert=true;checkDepth();}
applyPrefs();sectionOptions();render();refresh();setInterval(()=>refresh(),5*60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
