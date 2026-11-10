import {identity, sameOrigin} from './auth.mjs';
const REPO='BigChief-at-illuminathidotorg/Penn-News-Scraper';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const encode=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const decode=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0)));
export function parseCatalog(raw) {
  const array=marker=>{
    const pos=raw.indexOf(marker); if(pos<0)fail('Source list format is invalid.');
    const start=raw.indexOf('[',pos+marker.length); let depth=0,quoted=false,escaped=false;
    for(let i=start;i<raw.length;i++){const c=raw[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&--depth===0)return JSON.parse(raw.slice(start,i+1));}
    fail('Source list is incomplete.');
  };
  return {sites:array('window.PENN_MONITOR_DEFAULT_SITES'),groups:array('window.PENN_MONITOR_GROUPS')};
}
export function validateSources(sites,groups) {
  if(!Array.isArray(sites)||!sites.length||sites.length>200||!Array.isArray(groups))fail('Enter between 1 and 200 sources.');
  const ids=new Set();
  const web=value=>{if(!value)return;let u;try{u=new URL(value);}catch{fail('Enter a complete news URL.');}
    const host=u.hostname.toLowerCase();
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port||!/(^|\.)(upenn\.edu|pennmedicine\.org|penn\.museum|icaphila\.org|arthurrossgallery\.org|annenbergpublicpolicycenter\.org|mceas\.org)$/.test(host))fail('Use an approved Penn source address. Ask the owner to add any other publisher domain in server/api.mjs.');};
  for(const s of sites){if(!s||!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(s.id)||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>120)fail('Source names and IDs must be valid and unique.');ids.add(s.id);for(const k of ['newsUrl','feedUrl','magazineUrl'])web(s[k]);if(s.extraUrls&&!Array.isArray(s.extraUrls))fail('Additional pages must be a list.');for(const u of s.extraUrls||[])web(u);delete s.posts;}
  for(const g of groups){if(!g||typeof g.id!=='string'||typeof g.label!=='string'||!Array.isArray(g.sites))fail('Check the source sections.');g.sites=g.sites.filter(id=>ids.has(id));}
}
export async function handle(request,env,fetcher=fetch) {
  try {
    sameOrigin(request);
    const path=new URL(request.url).pathname.replace(/^\/api\/?/,'');
    if(path==='config')return json({ready:!!(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.ADMIN_EMAIL&&env.STAFF_DB&&(env.GITHUB_TOKEN||env.MONITOR_GITHUB_TOKEN)),login:'/api/login'});
    const email=await identity(request,env,fetcher);
    const admin=email===env.ADMIN_EMAIL.trim().toLowerCase();
    const member=await env.STAFF_DB.prepare('SELECT email,name,status,requested_at FROM staff WHERE email=?').bind(email).first();
    const approved=admin||member?.status==='approved';
    if(path==='login')return new Response(null,{status:302,headers:{Location:'/manage','Cache-Control':'no-store'}});
    if(path==='session')return json({email,admin,approved,status:admin?'owner':member?.status||'new'});
    const body=async()=>{const text=await request.text();if(text.length>200000)fail('This request is too large.',413);try{return JSON.parse(text);}catch{fail('Invalid request.');}};
    const audit=async(action,detail)=>env.STAFF_DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(email,action,detail,new Date().toISOString()).run();
    if(path==='access/request'&&request.method==='POST'){
      const b=await body();if(member)return json({status:member.status});
      await env.STAFF_DB.prepare("INSERT OR IGNORE INTO staff(email,name,status,requested_at) VALUES(?,?,'pending',?)").bind(email,String(b.name||'').trim().slice(0,120),new Date().toISOString()).run();
      return json({status:'pending'});
    }
    if(!approved)fail('Your access needs the owner’s approval.',403);
    if(path==='access'&&request.method==='GET'){
      if(!admin)fail('Only the owner can review access.',403);
      return json({people:(await env.STAFF_DB.prepare('SELECT * FROM staff ORDER BY requested_at DESC LIMIT 500').all()).results});
    }
    if(path==='access/review'&&request.method==='POST'){
      if(!admin)fail('Only the owner can review access.',403);const b=await body();
      if(!['approved','denied','revoked'].includes(b.status)||typeof b.email!=='string')fail('Choose approve, deny or revoke.');
      await env.STAFF_DB.batch([env.STAFF_DB.prepare('UPDATE staff SET status=?,reviewed_at=?,reviewed_by=? WHERE email=?').bind(b.status,new Date().toISOString(),email,b.email.toLowerCase()),env.STAFF_DB.prepare('INSERT INTO audit(actor,action,detail,created_at) VALUES(?,?,?,?)').bind(email,'access',JSON.stringify({email:b.email,status:b.status}),new Date().toISOString())]);return json({ok:true});
    }
    async function gh(endpoint,options={}) {
      const token=env.GITHUB_TOKEN||env.MONITOR_GITHUB_TOKEN;if(!token)fail('The GitHub connection has not been configured.',503);
      const r=await fetcher(`https://api.github.com/repos/${REPO}/${endpoint}`,{...options,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Penn-News-Monitor','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}});
      if(!r.ok)fail(r.status===409?'The source list changed while you were editing. Reload before saving.':`GitHub could not complete the request (HTTP ${r.status}). The owner should check the connection.`,r.status===409?409:502);
      return r.status===204?null:r.json();
    }
    if(path==='sources'){
      const file=await gh('contents/sites.js?ref=main');
      if(request.method==='GET')return json({...parseCatalog(decode(file.content)),sha:file.sha});
      if(request.method==='POST'){
        const b=await body();if(b.sha!==file.sha)fail('Another editor saved changes. Reload the list before saving.',409);validateSources(b.sites,b.groups);
        const content='// Penn News Monitor source catalog\nwindow.PENN_MONITOR_DEFAULT_SITES = '+JSON.stringify(b.sites,null,2)+';\n\nwindow.PENN_MONITOR_GROUPS = '+JSON.stringify(b.groups,null,2)+';\n';
        const saved=await gh('contents/sites.js',{method:'PUT',body:JSON.stringify({branch:'main',sha:file.sha,message:'Update source list from staff dashboard',content:encode(content)})});
        await audit('sources','Updated source catalog');return json({sha:saved.content.sha,ok:true});
      }
    }
    if(path==='jobs'&&request.method==='GET'){
      const results=await Promise.all(['collect.yml','archive.yml'].map(w=>gh(`actions/workflows/${w}/runs?per_page=10`)));
      const runs=results.flatMap(r=>r.workflow_runs).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,12);
      return json({runs:runs.map(r=>({id:r.id,name:r.display_title,status:r.status,conclusion:r.conclusion,url:r.html_url,createdAt:r.created_at}))});
    }
    if(/^jobs\/\d+$/.test(path)&&request.method==='GET'){
      const id=path.split('/')[1];const r=await gh(`actions/runs/${id}/jobs`);return json({jobs:r.jobs.map(j=>({name:j.name,status:j.status,conclusion:j.conclusion,steps:j.steps.map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))}))});
    }
    if(path==='run'&&request.method==='POST'){
      const b=await body();if(!['collect','archive'].includes(b.kind))fail('Choose a collection type.');
      const catalog=parseCatalog(decode((await gh('contents/sites.js?ref=main')).content));
      const source=String(b.source||'');if(source&&!catalog.sites.some(s=>s.id===source))fail('Choose a current source.');
      if(b.kind==='archive'&&!source)fail('Choose the source to archive.');
      const inputs={};
      if(b.kind==='collect')inputs.source_id=source;
      else{
        const from=String(b.from||'');if(from&&(!/^\d{4}-\d{2}-\d{2}$/.test(from)||Number.isNaN(Date.parse(from))||new Date(from).toISOString().slice(0,10)!==from||from>new Date().toISOString().slice(0,10)))fail('Enter a valid earliest date.');
        const limit=String(b.limit||25);if(!['10','25','50'].includes(limit))fail('Choose 10, 25 or 50 pages.');
        Object.assign(inputs,{source_id:source,earliest_date:from,page_limit:limit});
      }
      const now=Date.now();const lock=await env.STAFF_DB.prepare('INSERT INTO dispatch_lock(id,expires) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET expires=excluded.expires WHERE expires<?').bind(now+60000,now).run();
      if(!lock.meta.changes)fail('A request was just submitted. Wait a minute and check job status.',429);
      const active=await Promise.all(['queued','in_progress','waiting','pending'].map(s=>gh(`actions/runs?status=${s}&per_page=100`)));
      if(active.some(r=>r.workflow_runs.some(w=>['Collect and publish Penn news','Expand a source archive'].includes(w.name))))fail('A scraper job is already running or queued. Please let it finish first.',409);
      await gh(`actions/workflows/${b.kind==='archive'?'archive':'collect'}.yml/dispatches`,{method:'POST',body:JSON.stringify({ref:'main',inputs})});
      await audit('run',JSON.stringify({kind:b.kind,source,from:inputs.earliest_date||''}));
      return json({accepted:true,message:'Request accepted. It may take a moment to appear in recent jobs.'},202);
    }
    fail('Not found.',404);
  }catch(error){return json({error:error.status?error.message:'The staff service is unavailable. Ask the owner to check the database setup.'},error.status||503);}
}
