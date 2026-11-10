/* Shared by the browser and the query regression tests. */
(function(root){
'use strict';
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const tokens=q=>(String(q||'').match(/-?"[^"]+"|-?\S+/g)||[]).map(x=>({exclude:x.startsWith('-'),term:fold(x.replace(/^-/,'').replace(/^"|"$/g,''))})).filter(x=>x.term);
function contains(text,term){
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // Short acronyms like AI must not match "said", "chair" or "Paideia".
 return new RegExp('(^|[^\\p{L}\\p{N}])'+escape(term)+'(?=$|[^\\p{L}\\p{N}])','u').test(text);
}
function query(text,q,mode='all'){
 const terms=tokens(q),positive=terms.filter(x=>!x.exclude),negative=terms.filter(x=>x.exclude);
 return !negative.some(x=>contains(text,x.term))&&(!positive.length||(mode==='any'?positive.some(x=>contains(text,x.term)):positive.every(x=>contains(text,x.term))));
}
function fields(p){const i=p.searchIndex||{};return fold([p.title,p.dek,i.text,...(i.keywords||[]),...(i.authors||[]),...(i.journals||[]),i.doi].filter(Boolean).join(' '));}
function matches(p,f={}){
 if(f.from||f.to){if(p.undated&&!f.undated)return false;if(f.from&&p.date<f.from||f.to&&p.date>f.to)return false;}
 const text=f.scope==='headline'?fold(p.title+' '+(p.dek||'')):fields(p);
 return query(text,f.q,f.mode)&&(!f.person||contains(text,fold(f.person)))&&(!f.journal||contains(text,fold(f.journal)));
}
function snippet(p,f={}){
 const text=p.searchIndex?.text||p.dek||'';
 const key=[f.person,f.journal,...tokens(f.q).filter(t=>!t.exclude).map(t=>t.term)].find(k=>k&&fold(text).includes(fold(k)));
 if(!key)return text.slice(0,300);
 const at=fold(text).indexOf(fold(key)),start=Math.max(0,at-90);
 return (start?'…':'')+text.slice(start,start+340)+(text.length>start+340?'…':'');
}
const api={fold,tokens,contains,query,fields,matches,snippet};root.ArchiveSearch=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
