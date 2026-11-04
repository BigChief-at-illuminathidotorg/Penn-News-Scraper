import json, unittest
from pathlib import Path
from scraper import load_sites, news_only, clean_title, loadable, SITE_RULES
from publish_snapshot import merge_snapshot
REMOVED = {'fox-leadership', 'wolf-humanities-center', 'the-botswana-upenn-partnership', 'weiss-tech-house',
           'christopher-h-browne-center-for-international-politics', 'center-for-technology-innovation-and-competition',
           'the-marks-family-center-for-excellence-in-writing', 'penn-institute-for-economic-research'}
class Sources(unittest.TestCase):
 def test_requested(self):
  sites=load_sites(); urls={s['newsUrl'] for s in sites}; requested=json.loads(Path('tests/requested_sources.json').read_text())
  self.assertEqual(len(sites),56)
  self.assertEqual(len({s['id'] for s in sites}),56)
  for url in requested.values(): self.assertIn(url,urls)
  self.assertEqual(Path('sites.js').read_bytes(),Path('public/sites.js').read_bytes())
  self.assertEqual({s['id'] for s in sites},{s['id'] for s in json.loads(Path('public/data/sources.json').read_text())['sites']})
 def test_removed_and_moved(self):
  sites={s['id']:s for s in load_sites()}
  self.assertFalse(REMOVED & set(sites))
  self.assertEqual(sites['kleinman-center-for-energy-policy']['parentUnit'],'Weitzman')
 def test_undated_sites_keep_seven(self):
  for sid in ('perry-world-house','penn-sustainability','nursing','sas-omnia'):
   self.assertTrue(SITE_RULES[sid].get('date_optional')); self.assertEqual(SITE_RULES[sid].get('max_items'),7)
 def test_course_feeds_rejected(self):
  courses=[{'title':f'BIOL{n} - Biology {n}','link':f'https://x.edu/node/{n}','date':'2026-10-12'} for n in range(3000,3010)]
  news=[{'title':'Lab wins award','link':'https://x.edu/news/lab-wins-award','date':'2026-10-20'}]
  self.assertEqual(news_only(courses+news),[])
  self.assertEqual(news_only(news+courses[:1]),news)
 def test_titles_and_links_cleaned(self):
  self.assertEqual(clean_title('Joint Therapies with Dr. Ortved (link is external)'),'Joint Therapies with Dr. Ortved')
  self.assertEqual(loadable('https://v.edu/all-news/?filter[article_type][]=penn-vet-news'),'https://v.edu/all-news/?filter%5Barticle_type%5D%5B%5D=penn-vet-news')
 def test_undated_story_keeps_first_seen_date(self):
  old={'sites':[{'id':'x','newsUrl':'https://x.edu/news','posts':[{'title':'Old story','link':'https://x.edu/a','date':'2026-11-02'}]}]}
  new={'lastRefreshAt':'2026-11-04T12:00:00Z','sites':[{'id':'x','name':'X','newsUrl':'https://x.edu/news','posts':[
   {'title':'Old story','link':'https://x.edu/a','date':'2026-11-04','undated':True},
   {'title':'New story','link':'https://x.edu/b','date':'2026-11-04','undated':True}]}]}
  posts=merge_snapshot(new,old)['sites'][0]['posts']
  self.assertEqual({p['link']:p['date'] for p in posts},{'https://x.edu/a':'2026-11-02','https://x.edu/b':'2026-11-04'})
 def test_changed_url_never_reuses_wrong_articles(self):
  post={'title':'Story','link':'https://example.com/story'}
  old={'sites':[{'id':'x','newsUrl':'https://old.example.com','posts':[post]}]}
  new={'lastRefreshAt':'2026-11-03T12:00:00Z','sites':[{'id':'x','name':'X','newsUrl':'https://new.example.com','posts':[]},{'id':'y','name':'Y','posts':[post]}]}
  self.assertEqual(merge_snapshot(new,old)['sites'][0]['posts'],[])
 def test_empty_collection_rejected(self):
  with self.assertRaises(ValueError):merge_snapshot({'lastRefreshAt':'2026-11-03T12:00:00Z','sites':[{'id':'x','name':'X','posts':[]}]},{})
