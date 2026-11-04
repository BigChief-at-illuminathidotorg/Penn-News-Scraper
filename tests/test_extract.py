"""Browser-side extraction on small sample pages (skipped where Chromium isn't installed)."""
import unittest
from scraper import EXTRACT_JS, rule_args

CARD = ('<div class="card card--news"><span class="calendar"><time datetime="2026-11-0{n}T12:00:00Z">{n} Nov 2026</time></span>'
        '<h2><a href="/news-events/news/story-number-{n}-for-the-test">Story number {n} for the extraction test</a></h2><p>Summary.</p></div>')
# One <article> wrapping the whole listing, the way Annenberg's news page is built.
LISTING = '<html><body><article class="basic-page"><h1>News</h1>' + ''.join(CARD.format(n=n) for n in (5, 4, 3, 2)) + '</article></body></html>'


# GSE-style list: the school's own stories mixed with "in the news" links elsewhere.
ITEM = ('<div class="news_list_item"><h2><a href="{href}">{title} for the extraction test</a></h2>'
        '<time class="news_list_item_date" datetime="2026-11-0{n}">Nov {n}, 2026</time></div>')
MIXED = '<html><body>' + ''.join(ITEM.format(n=n, href=h, title=t) for n, h, t in (
    (4, '/news/our-own-story-number-one', 'Our own story one'),
    (3, 'https://www.forbes.com/sites/someone/2026/11/03/a-quote', 'An outside outlet quotes us'),
    (2, '/news/our-own-story-number-two', 'Our own story two'),
    (1, '/news/our-own-story-number-three', 'Our own story three'))) + '</body></html>'


class Extract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.pw = sync_playwright().start()
        try:
            cls.browser = cls.pw.chromium.launch()
        except Exception as e:
            cls.pw.stop()
            raise unittest.SkipTest(f'Chromium is not installed here: {str(e).splitlines()[0]}')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def extract(self, html, site_id):
        page = self.browser.new_page()
        page.route('https://news.example.edu/', lambda route: route.fulfill(body=html, content_type='text/html'))
        page.goto('https://news.example.edu/')
        try:
            return page.evaluate(EXTRACT_JS, rule_args(site_id))
        finally:
            page.close()

    def test_first_story_kept_when_one_article_wraps_the_listing(self):
        first = 'https://news.example.edu/news-events/news/story-number-5-for-the-test'
        for site_id in ('annenberg', 'a-site-with-no-rules'):
            links = [a['link'] for a in self.extract(LISTING, site_id)]
            self.assertEqual(len(links), 4, site_id)
            self.assertEqual(links[0], first, site_id)


    def test_same_host_keeps_only_the_sites_own_stories(self):
        links = [a['link'] for a in self.extract(MIXED, 'gse')]
        self.assertEqual(len(links), 3)
        self.assertTrue(all(l.startswith('https://news.example.edu/news/') for l in links))
        self.assertEqual(len(self.extract(MIXED, 'a-site-with-no-rules')), 4)


if __name__ == '__main__':
    unittest.main()
