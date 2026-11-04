"""Publish the canonical sites.js catalog for the browser (no collection timestamps).

sites.js can be edited from the monitor itself (functions/api), so this checks the
list's shape rather than its contents, then writes public/data/sources.json and
the public/sites.js copy."""
import hashlib
import json
import re
import shutil
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse
from scraper import load_sites

FIELDS = ('id', 'name', 'exportName', 'parentUnit', 'bucket', 'subhead', 'newsUrl', 'extraUrls', 'magazineUrl', 'notes', 'feedUrl')
_ID = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def source_version():
    return hashlib.sha256(Path(__file__).with_name('sites.js').read_bytes()).hexdigest()


def _check_url(value, label, sid, required=False):
    if value in (None, ''):
        if required:
            raise ValueError(f'{sid}: {label} is required')
        return
    parts = urlparse(value) if isinstance(value, str) else None
    if not parts or parts.scheme not in ('http', 'https') or '.' not in parts.netloc:
        raise ValueError(f'{sid}: {label} is not a web address: {value!r}')


def validate_sites(sites):
    if not isinstance(sites, list) or not sites:
        raise ValueError('sites.js has no sources')
    seen = set()
    for s in sites:
        sid = s.get('id') if isinstance(s, dict) else None
        if not isinstance(sid, str) or not _ID.match(sid):
            raise ValueError(f'Source id {sid!r} must be lowercase words joined by hyphens')
        if sid in seen:
            raise ValueError(f'Source id {sid} is used twice')
        seen.add(sid)
        if not isinstance(s.get('name'), str) or not s['name'].strip():
            raise ValueError(f'{sid}: name is required')
        _check_url(s.get('newsUrl'), 'newsUrl', sid)
        _check_url(s.get('feedUrl'), 'feedUrl', sid)
        extra = s.get('extraUrls')
        if extra is not None and not isinstance(extra, list):
            raise ValueError(f'{sid}: extraUrls must be a list')
        for url in extra or []:
            _check_url(url, 'extraUrls', sid, required=True)
    return sites


def catalog():
    sites = validate_sites(load_sites())
    return {'schemaVersion': 1, 'version': source_version(), 'publishedAt': datetime.now(timezone.utc).isoformat(),
            'sites': [{k: s.get(k) for k in FIELDS} for s in sites]}


if __name__ == '__main__':
    target = Path('public/data/sources.json')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(catalog(), ensure_ascii=False, indent=2) + '\n')
    shutil.copyfile(Path(__file__).with_name('sites.js'), Path('public/sites.js'))
    print('Published source catalog from sites.js')
