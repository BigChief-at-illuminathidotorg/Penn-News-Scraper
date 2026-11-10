import unittest

from archive_scraper import merge_archive, next_url


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.site = {'id': 'omnia', 'name': 'SAS - Omnia',
                     'newsUrl': 'https://omnia.sas.upenn.edu/latest', 'extraUrls': []}
        self.one = {'title': 'First', 'date': '2024-05-02',
                    'link': 'https://omnia.sas.upenn.edu/first', 'dek': ''}
        self.two = {'title': 'Second', 'date': '2026-11-09',
                    'link': 'https://omnia.sas.upenn.edu/second', 'dek': ''}
        self.meta = {'pagesScanned': 4, 'stopReasons': ['no next-page link found'],
                     'warnings': [], 'requestedFrom': '2024-01-01'}

    def test_pagination_stays_on_host(self):
        current = self.site['newsUrl']
        self.assertEqual(next_url(current, '/latest?page=2'), 'https://omnia.sas.upenn.edu/latest?page=2')
        self.assertIsNone(next_url(current, 'https://other.example/latest?page=2'))
        self.assertIsNone(next_url(current, 'javascript:alert(1)'))

    def test_merges_discoveries_with_current_snapshot(self):
        latest = dict(self.site, posts=[self.two])
        archive = merge_archive(self.site, [self.one], {}, latest, self.meta)
        self.assertEqual([p['date'] for p in archive['posts']], ['2026-11-09', '2024-05-02'])
        self.assertEqual(archive['oldestCaptured'], '2024-05-02')
        self.assertEqual(archive['listingUrls'], [self.site['newsUrl']])

    def test_url_change_does_not_reuse_old_archive(self):
        stale = {'listingUrls': ['https://old.example/news'], 'posts': [self.one]}
        result = merge_archive(self.site, [], stale, {}, self.meta)
        self.assertEqual(result['posts'], [])


if __name__ == '__main__':
    unittest.main()
