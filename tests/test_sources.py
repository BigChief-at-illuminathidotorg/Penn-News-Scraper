import json, unittest
from pathlib import Path
from scraper import load_sites
from publish_snapshot import merge_snapshot
class Sources(unittest.TestCase):
 def test_requested(self):
  sites=load_sites(); urls={s['newsUrl'] for s in sites}; requested=json.loads(Path('tests/requested_sources.json').read_text())
  self.assertEqual(len(sites),64)
  self.assertEqual(len({s['id'] for s in sites}),64)
  for url in requested.values(): self.assertIn(url,urls)
  self.assertEqual(Path('sites.js').read_bytes(),Path('public/sites.js').read_bytes())
  self.assertEqual({s['id'] for s in sites},{s['id'] for s in json.loads(Path('public/data/sources.json').read_text())['sites']})
 def test_changed_url_never_reuses_wrong_articles(self):
  post={'title':'Story','link':'https://example.com/story'}
  old={'sites':[{'id':'x','newsUrl':'https://old.example.com','posts':[post]}]}
  new={'lastRefreshAt':'2026-11-03T12:00:00Z','sites':[{'id':'x','name':'X','newsUrl':'https://new.example.com','posts':[]},{'id':'y','name':'Y','posts':[post]}]}
  self.assertEqual(merge_snapshot(new,old)['sites'][0]['posts'],[])
 def test_empty_collection_rejected(self):
  with self.assertRaises(ValueError):merge_snapshot({'lastRefreshAt':'2026-11-03T12:00:00Z','sites':[{'id':'x','name':'X','posts':[]}]},{})
