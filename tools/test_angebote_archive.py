import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import urllib.error
from angebote_archive import source_url, page_metadata, parse_page, discover, collect, SameSiteRedirect

URL='https://angebote.com/lidl/woche-39-ab-21-09-2026-bis-26-09-2026-seite-1-aoozd'
HTML='''<html><h1>Lidl Prospekt Seite 1</h1><img src="https://vm-folders.ams3.digitaloceanspaces.com/folders/41620/pages/full-1.jpg"><p>Navigation Milch</p><!-- OCR --><h2>Andere Inhalte</h2><small><b>Warnung</b><p>BÄRENMARKE Haltbare Milch<br>3,5 % Fett &amp; 1 l</p>Seitentitel</small><script>track()</script><p>Werbung Kaffee</p></html>'''

class Tests(unittest.TestCase):
    def test_ocr_isolated_from_navigation_tracking_and_disclaimer(self):
        row=parse_page(HTML,URL)
        self.assertEqual(row['ocrText'],'BÄRENMARKE Haltbare Milch 3,5 % Fett & 1 l')
        self.assertEqual(row['validTo'],'2026-09-26')
        self.assertEqual(row['annotationStatus'],'unreviewed')
        self.assertEqual(row['automaticLabelsWritten'],0)
        self.assertNotIn('positive',row)
        self.assertEqual(len(row['ocrSha256']),64)

    def test_url_and_date_boundaries(self):
        for url in ['http://angebote.com/lidl/archives','https://angebote.com.evil.test/lidl/archives','https://angebote.com:443/lidl/archives','https://angebote.com/lidl/archives?x=1','https://user@angebote.com/lidl/archives','https://127.0.0.1/lidl/archives','https://angebote.com/impressum']:
            with self.assertRaises(ValueError):source_url(url)
        with self.assertRaises(ValueError):page_metadata(URL,today=dt.date(2026,9,26))
        self.assertEqual(page_metadata(URL,today=dt.date(2026,9,27))['page'],1)
        with self.assertRaises(ValueError):SameSiteRedirect().redirect_request(None,None,302,'',{},'https://evil.test/')

    def test_missing_ocr_never_falls_back_to_whole_page(self):
        with self.assertRaises(ValueError):parse_page(HTML.replace('<!-- OCR -->',''),URL)

    def test_discovery_chooses_expired_same_retailer_and_deduplicates(self):
        html=f'<a href="{URL}">alt</a><a href="{URL}">alt</a><a href="{URL.replace("2026","2099")}">Zukunft</a>'
        self.assertEqual(discover(html,'https://angebote.com/lidl/archives',2),[URL,URL.replace('-seite-1-','-seite-2-')])

    def test_403_records_failure_without_retries_or_labels(self):
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'run'
            with patch('angebote_archive.Fetcher.load_robots',return_value='User-agent: *\nDisallow:\n'),patch('angebote_archive.Fetcher.get',side_effect=urllib.error.HTTPError(URL,403,'Forbidden',{},None)) as get:
                with self.assertRaises(urllib.error.HTTPError):collect(out,archive_url='https://angebote.com/lidl/archives')
                self.assertEqual(get.call_count,1)
            report=json.loads((out/'report.json').read_text())
            self.assertEqual(report['status'],'failed')
            self.assertEqual(report['automaticLabelsWritten'],0)
            self.assertFalse((out/'pages.jsonl').exists())

    def test_manifest_limit_is_explicit_and_duplicates_are_rejected(self):
        for urls in [[URL]*2, [URL.replace('-seite-1-',f'-seite-{i}-') for i in range(1,34)]]:
            with tempfile.TemporaryDirectory() as temp:
                manifest=Path(temp)/'sources.json';manifest.write_text(json.dumps({'pages':urls}))
                with patch('angebote_archive.Fetcher.load_robots',return_value='User-agent: *\nDisallow:\n'):
                    with self.assertRaises(ValueError):collect(Path(temp)/'run',manifest=manifest)

    def test_page_manifest_and_image_provenance(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest=Path(temp)/'sources.json';manifest.write_text(json.dumps({'pages':[URL]}))
            out=Path(temp)/'run'
            with patch('angebote_archive.Fetcher.load_robots',return_value='User-agent: *\nDisallow:\n'),patch('angebote_archive.Fetcher.get',return_value=HTML),patch('angebote_archive.Fetcher.image',return_value=b'\xff\xd8\xffimage'):
                report=collect(out,manifest=manifest)
            self.assertEqual(report['pages'],1)
            row=json.loads((out/'pages.jsonl').read_text())
            self.assertEqual(len(row['imageSha256']),64)
            self.assertTrue((out/row['imageFile']).exists())
            self.assertEqual(report['automaticLabelsWritten'],0)

if __name__=='__main__':unittest.main()
