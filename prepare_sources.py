"""Publish the canonical sites.js catalog for the browser (no collection timestamps)."""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
from scraper import load_sites

def source_version():
    return hashlib.sha256(Path(__file__).with_name('sites.js').read_bytes()).hexdigest()

def catalog():
    fields=('id','name','exportName','parentUnit','bucket','subhead','newsUrl','magazineUrl','notes','feedUrl')
    sites=load_sites()
    if len({s['id'] for s in sites})!=len(sites):
        raise ValueError('Source IDs must be unique')
    return {'schemaVersion':1,'version':source_version(),'publishedAt':datetime.now(timezone.utc).isoformat(),'sites':[{k:s.get(k) for k in fields} for s in sites]}

if __name__=='__main__':
    target=Path('public/data/sources.json');target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(catalog(),ensure_ascii=False,indent=2)+'\n')
    print('Published source catalog from sites.js')
