"""Validate a collection and retain last-known articles when a source is empty."""
import json
from pathlib import Path
from datetime import datetime

def merge_snapshot(current, previous):
    sites = current.get('sites')
    if not isinstance(sites, list) or not sites:
        raise ValueError('Collection has no source list; refusing publication')
    datetime.fromisoformat(current['lastRefreshAt'].replace('Z', '+00:00'))
    old = {s['id']: s for s in previous.get('sites', [])}
    good = 0
    seen = set()
    for site in sites:
        if site['id'] in seen or not isinstance(site.get('posts'), list):
            raise ValueError('Invalid or duplicate source')
        seen.add(site['id'])
        for post in site['posts']:
            if not post.get('title') or not post.get('link', '').startswith(('https://', 'http://')):
                raise ValueError('Invalid article')
        if site['posts']:
            good += 1
        elif old.get(site['id'], {}).get('posts'):
            prior = old[site['id']]
            site['posts'] = prior['posts']
            site['lastSyncAt'] = prior.get('lastSyncAt', '')
            site['lastError'] = 'Latest check returned no articles; showing earlier results. ' + site.get('lastError', '')
    if good == 0:
        raise ValueError('No source succeeded; keeping the published collection unchanged')
    current['refreshErrors'] = [s['name'] + ': ' + s['lastError'] for s in sites if s.get('lastError')]
    return current

if __name__ == '__main__':
    target = Path('public/data/latest.json')
    current = json.loads(Path('collected.json').read_text())
    previous = json.loads(target.read_text()) if target.exists() else {}
    merged = merge_snapshot(current, previous)
    target.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n')
    print(f"Prepared {len(merged['sites'])} sources; {len(merged['refreshErrors'])} need attention")
