"""Build a searchable article-text index with explicit coverage and bounded visits."""
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlparse

ARTICLE_JS = r'''() => {
 const meta = name => [...document.querySelectorAll('meta')].filter(n => (n.getAttribute('name')||n.getAttribute('property')||'').toLowerCase() === name).map(n=>n.content).filter(Boolean);
 const structured=[];
 function visit(x){if(Array.isArray(x)){x.forEach(visit);return;}if(!x||typeof x!=='object')return;
   if([].concat(x['@type']||[]).some(t=>/Article|NewsArticle|ScholarlyArticle|BlogPosting/.test(t)))structured.push(x);
   if(x['@graph'])visit(x['@graph']);}
 for(const el of document.querySelectorAll('script[type="application/ld+json"]'))try{visit(JSON.parse(el.textContent));}catch{}
 const candidate=structured.find(x=>x.articleBody)||structured[0]||{};
 const root=document.querySelector('[itemprop="articleBody"], .field--name-body, .entry-content, .article-body, .story-body, article')||document.querySelector('main');
 let body='';
 if(root){const clone=root.cloneNode(true);clone.querySelectorAll('nav,header,footer,aside,script,style,form,.related-posts,.related-content').forEach(n=>n.remove());body=clone.textContent;}
 body=(candidate.articleBody||body||'').replace(/\s+/g,' ').trim();
 const names=x=>[].concat(x||[]).map(v=>typeof v==='string'?v:v?.name||'').filter(Boolean);
 return {text:body.slice(0,80000),textTruncated:body.length>80000,
   keywords:[...meta('keywords'),...names(candidate.keywords),...names(candidate.about)],
   authors:[...meta('citation_author'),...names(candidate.author)],
   journals:[...meta('citation_journal_title'),...names(candidate.isPartOf)],
   doi:meta('citation_doi')[0]||'',description:meta('description')[0]||meta('og:description')[0]||''};
}'''


def allowed_article(url, hosts):
    p=urlparse(url)
    return p.scheme in ('https','http') and p.hostname in hosts and not p.username and not p.password and p.port in (None,80,443)


def carry_index(posts, previous):
    saved={p['link']:p for p in previous if p.get('searchIndex',{}).get('version')==1}
    for p in posts:
        old=saved.get(p.get('link'))
        if old: p['searchIndex']=old['searchIndex']
    return posts


async def enrich_posts(browser, site, posts, earliest='', maximum=500):
    hosts={urlparse(u).hostname for u in [site.get('newsUrl'),site.get('feedUrl'),*(site.get('extraUrls') or [])] if u}
    ctx=await browser.new_context(locale='en-US')
    sem=asyncio.Semaphore(3)
    candidates=[p for p in posts if not p.get('searchIndex',{}).get('text') and (not earliest or p.get('undated') or p.get('date','')>=earliest)]
    attempted=0
    async def one(post):
        nonlocal attempted
        async with sem:
            if not allowed_article(post.get('link',''),hosts):
                post['indexError']='Article points outside this source; headline and summary only.';return
            attempted+=1
            page=await ctx.new_page()
            async def route(r):
                if r.request.is_navigation_request() and not allowed_article(r.request.url,hosts):await r.abort()
                elif r.request.resource_type in ('image','media','font'):await r.abort()
                else:await r.continue_()
            await page.route('**/*',route)
            try:
                response=await page.goto(post['link'],wait_until='domcontentloaded',timeout=20000)
                if not response or response.status>=400:raise ValueError(f'HTTP {response.status if response else "no response"}')
                data=await page.evaluate(ARTICLE_JS)
                if len(data['text'])<150:raise ValueError('No readable article body found')
                post['searchIndex']={**data,'version':1,'indexedAt':datetime.now(timezone.utc).isoformat()}
                post.pop('indexError',None)
            except Exception as exc:post['indexError']=str(exc).splitlines()[0][:160]
            finally:await page.close()
    try:await asyncio.gather(*(one(p) for p in candidates[:maximum]))
    finally:await ctx.close()
    return {'indexed':sum(bool(p.get('searchIndex',{}).get('text')) for p in posts),
            'total':len(posts),'attempted':attempted,'remaining':max(0,len(candidates)-maximum),
            'failed':sum(bool(p.get('indexError')) for p in posts)}
