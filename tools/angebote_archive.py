"""Bounded Angebote.com OCR-page pilot. Collection never creates training labels."""
import argparse
import datetime as dt
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path

AGENT = 'Ha-Angebote-Checker/0.1 (+archive-pilot)'
LIMIT = 2_000_000
PAGE = re.compile(r'^/(?P<retailer>[a-z0-9-]+)/woche-\d+-ab-(?P<start>\d{2}-\d{2}-\d{4})-bis-(?P<end>\d{2}-\d{2}-\d{4})-seite-(?P<page>\d+)-(?P<code>[a-z0-9]+)$')


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def source_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme != 'https' or p.netloc != 'angebote.com' or p.query or p.fragment:
        raise ValueError('Nur HTTPS-Seiten auf angebote.com ohne Zusatzparameter sind erlaubt')
    if not (PAGE.fullmatch(p.path) or re.fullmatch(r'/[a-z0-9-]+/archives', p.path) or p.path == '/robots.txt'):
        raise ValueError('Keine gültige Archiv- oder Prospektseite')
    return url


def page_metadata(url, today=None):
    source_url(url)
    m = PAGE.fullmatch(urllib.parse.urlsplit(url).path)
    if not m:
        raise ValueError('Eine datierte Prospektseite ist erforderlich')
    start = dt.datetime.strptime(m['start'], '%d-%m-%Y').date()
    end = dt.datetime.strptime(m['end'], '%d-%m-%Y').date()
    if end < start or end >= (today or dt.date.today()) or int(m['page']) < 1:
        raise ValueError('Nur abgeschlossene historische Prospekte sind erlaubt')
    return dict(retailer=m['retailer'], validFrom=start.isoformat(), validTo=end.isoformat(),
                page=int(m['page']), brochureId=f"{m['retailer']}:{start}:{end}:{m['code']}")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ocr_marker = False
        self.in_ocr = False
        self.done = False
        self.h1 = False
        self.title = []
        self.text = []
        self.links = []
        self.image = None

    def handle_comment(self, data):
        if data.strip() == 'OCR':
            self.ocr_marker = True

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h1':
            self.h1 = True
        if tag == 'a' and attrs.get('href'):
            self.links.append(urllib.parse.urljoin('https://angebote.com/', attrs['href']))
        if tag == 'img' and not self.image:
            src = attrs.get('src', '')
            p = urllib.parse.urlsplit(src)
            if p.scheme == 'https' and p.netloc == 'vm-folders.ams3.digitaloceanspaces.com' and re.fullmatch(r'/folders/\d+/pages/full-\d+\.jpg', p.path):
                self.image = src
        if tag == 'p' and self.ocr_marker and not self.done:
            self.in_ocr = True
        if self.in_ocr and tag == 'br':
            self.text.append('\n')

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.h1 = False
        if tag == 'p' and self.in_ocr:
            self.in_ocr = False
            self.done = True

    def handle_data(self, data):
        if self.h1:
            self.title.append(data)
        if self.in_ocr:
            self.text.append(data)


def parse_page(html, url):
    meta = page_metadata(url)
    parser = PageParser()
    parser.feed(html)
    text = re.sub(r'\s+', ' ', ''.join(parser.text)).strip()
    title = re.sub(r'\s+', ' ', ''.join(parser.title)).strip()
    if not text or not title or not parser.image:
        raise ValueError('Keine vollständige OCR-Prospektseite erkannt; keine Ersatztexte aus Navigation verwenden')
    return dict(provider='angebote.com', sourceUrl=url, **meta, title=title,
                imageUrl=parser.image, ocrText=text, ocrSha256=digest(text),
                htmlSha256=digest(html), fetchedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                annotationStatus='unreviewed', automaticLabelsWritten=0)


class SameSiteRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        source_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Bildweiterleitungen sind für diesen Pilotlauf nicht erlaubt')


class Fetcher:
    def __init__(self):
        self.opener = urllib.request.build_opener(SameSiteRedirect())
        self.last = 0.0
        self.delay = 1.2
        self.robots = None

    def get(self, url):
        source_url(url)
        if self.robots is not None and not self.robots.can_fetch(AGENT, url):
            raise ValueError('robots.txt erlaubt diese Seite nicht')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        request = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,text/plain;q=0.9'})
        with self.opener.open(request, timeout=25) as response:
            source_url(response.url)
            if response.headers.get_content_type() not in ('text/html', 'text/plain'):
                raise ValueError('Unerwarteter Inhaltstyp')
            data = response.read(LIMIT + 1)
            if len(data) > LIMIT:
                raise ValueError('Antwort überschreitet 2 MB')
            return data.decode('utf-8')

    def image(self, url):
        p = urllib.parse.urlsplit(url)
        if p.scheme != 'https' or p.netloc != 'vm-folders.ams3.digitaloceanspaces.com' or p.query or p.fragment or not re.fullmatch(r'/folders/\d+/pages/full-\d+\.jpg', p.path):
            raise ValueError('Ungültige Prospektbildquelle')
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        self.last = time.monotonic()
        # No redirects: the image must come from the exact page-linked CDN path.
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(urllib.request.Request(url, headers={'User-Agent': AGENT}), timeout=25) as response:
            data = response.read(8_000_001)
            if len(data) > 8_000_000 or not data.startswith(b'\xff\xd8\xff'):
                raise ValueError('Kein begrenztes JPEG-Prospektbild')
            return data

    def load_robots(self):
        text = self.get('https://angebote.com/robots.txt')
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(text.splitlines())
        delay = self.robots.crawl_delay(AGENT)
        if delay and delay > 10:
            raise ValueError('Crawl-Verzögerung für diesen kurzen Pilotlauf zu groß')
        self.delay = max(self.delay, delay or 0)
        return text


def discover(html, archive_url, max_pages):
    source_url(archive_url)
    retailer = urllib.parse.urlsplit(archive_url).path.split('/')[1]
    parser = PageParser()
    parser.feed(html)
    candidates = []
    for url in dict.fromkeys(parser.links):
        try:
            meta = page_metadata(url)
        except ValueError:
            continue
        if meta['retailer'] == retailer and meta['page'] == 1:
            candidates.append((meta['validTo'], url))
    if not candidates:
        raise ValueError('Keine abgeschlossenen historischen Prospekte gefunden')
    first = max(candidates)[1]
    return [re.sub(r'-seite-1-', f'-seite-{i}-', first) for i in range(1, max_pages + 1)]


def collect(out, manifest=None, archive_url=None, max_pages=2):
    if not 1 <= max_pages <= 6:
        raise ValueError('Ein Pilotlauf darf 1–6 Seiten laden')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    report = dict(status='running', pages=0, automaticLabelsWritten=0, errors=[])
    rows = []
    try:
        fetcher = Fetcher()
        (out / 'robots.txt').write_text(fetcher.load_robots(), encoding='utf-8')
        if manifest:
            urls = json.loads(Path(manifest).read_text(encoding='utf-8'))['pages']
            if not isinstance(urls, list) or not 1 <= len(urls) <= 6 or len(set(urls)) != len(urls):
                raise ValueError('Das Manifest muss 1–6 verschiedene Seiten enthalten')
            for url in urls:
                page_metadata(url)
        else:
            source_url(archive_url)
            if not archive_url.endswith('/archives'):
                raise ValueError('Eine Archivübersicht ist erforderlich')
            urls = discover(fetcher.get(archive_url), archive_url, max_pages)
        for url in urls:
            row = parse_page(fetcher.get(url), url)
            image = fetcher.image(row['imageUrl'])
            row['imageSha256'] = hashlib.sha256(image).hexdigest()
            row['imageFile'] = f"image-{row['imageSha256'][:16]}.jpg"
            (out / row['imageFile']).write_bytes(image)
            rows.append(row)
            (out / 'pages.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in rows), encoding='utf-8')
        report.update(status='complete', pages=len(rows))
    except Exception as error:
        report.update(status='failed', pages=len(rows), errors=[f'{type(error).__name__}: {error}'])
        raise
    finally:
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--manifest')
    group.add_argument('--archive-url')
    p.add_argument('--max-pages', type=int, default=2)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    try:
        print(json.dumps(collect(args.out, args.manifest, args.archive_url, args.max_pages), ensure_ascii=False))
    except Exception as error:
        p.exit(1, f'Archiv-Pilot fehlgeschlagen: {error}\n')


if __name__ == '__main__':
    main()
