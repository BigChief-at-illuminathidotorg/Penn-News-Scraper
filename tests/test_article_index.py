import unittest
from article_index import allowed_article, carry_index
from publish_snapshot import merge_snapshot
class IndexTest(unittest.TestCase):
    def test_article_hosts(self):
        self.assertTrue(allowed_article('https://www.bio.upenn.edu/news/story',{'www.bio.upenn.edu'}))
        self.assertFalse(allowed_article('http://127.0.0.1/secret',{'www.bio.upenn.edu'}))
        self.assertFalse(allowed_article('https://www.bio.upenn.edu.evil.test/a',{'www.bio.upenn.edu'}))
    def test_preserve_index_after_listing_refresh(self):
        old={'link':'https://example/a','searchIndex':{'version':1,'text':'Journal and faculty'}}
        result=carry_index([{'link':old['link'],'title':'New headline'}],[old])
        self.assertEqual(result[0]['searchIndex']['text'],'Journal and faculty')
    def test_selected_collection_preserves_untouched_source(self):
        post={'title':'A','link':'https://example/a','date':'2024-01-01'}
        old={'sites':[{'id':'b','newsUrl':'https://example/b','posts':[post],'lastSyncAt':'2024-01-01'}]}
        current={'lastRefreshAt':'2026-11-10T13:00:00Z','selectedSourceIds':['a'],'sites':[{'id':'a','newsUrl':'https://example/a','posts':[post]},{'id':'b','newsUrl':'https://example/b','posts':[],'lastSyncAt':'2026-11-10','lastError':'No articles'}]}
        self.assertEqual(merge_snapshot(current,old)['sites'][1],old['sites'][0])
