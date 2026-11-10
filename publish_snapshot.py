"""Validate a collection and retain last-known articles when a source is empty."""
import json
import os
from prepare_sources import source_version
from pathlib import Path
from datetime import datetime

def keep_first_seen_dates(site, prior):
    """Stories from sites that show no dates are dated the day they were found.
    Keep the earliest such date, so a story doesn't look new on every run."""
    if not prior or prior.get('newsUrl') != site.get('newsUrl'):
        return
    seen = {p.get('link'): p.get('date', '') for p in prior.get('posts', []) if p.get('link')}
    for post in site['posts']:
        earlier = seen.get(post.get('link'))
        if post.get('undated') and earlier and earlier < post.get('date', ''):
            post['date'] = earlier
    site['posts'].sort(key=lambda p: p.get('date', ''), reverse=True)


def same_pages(a, b):
    """Both collections read the same listing page(s)."""
    return a.get('newsUrl') == b.get('newsUrl') and (a.get('extraUrls') or []) == (b.get('extraUrls') or [])


def merge_snapshot(current, previous):
    sites = current.get('sites')
    if not isinstance(sites, list) or not sites:
        raise ValueError('Collection has no source list; refusing publication')
    datetime.fromisoformat(current['lastRefreshAt'].replace('Z', '+00:00'))
    old = {s['id']: s for s in previous.get('sites', [])}
    selected = set(current.get('selectedSourceIds') or [])
    if selected:
        for index, site in enumerate(sites):
            prior = old.get(site['id'])
            if site['id'] not in selected and prior and same_pages(prior, site):
                sites[index] = prior
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
            if not selected or site['id'] in selected:
                good += 1
            keep_first_seen_dates(site, old.get(site['id']))
        elif old.get(site['id'], {}).get('posts') and same_pages(old[site['id']], site):
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
    merged['schemaVersion'] = 3
    merged['collection'] = {
        'sourceVersion': source_version(),
        'runId': os.environ.get('GITHUB_RUN_ID', ''),
        'commit': os.environ.get('GITHUB_SHA', ''),
        'runUrl': 'https://github.com/' + os.environ.get('GITHUB_REPOSITORY', 'BigChief-at-illuminathidotorg/Penn-News-Scraper') + '/actions/runs/' + os.environ.get('GITHUB_RUN_ID', '')
    }
    target.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n')
    print(f"Prepared {len(merged['sites'])} sources; {len(merged['refreshErrors'])} need attention")

