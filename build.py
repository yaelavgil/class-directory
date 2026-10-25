#!/usr/bin/env python3
"""Generates one static folder per directory listed in dirs.json, so every class gets its own link,
tab title, favicon and WhatsApp preview. The data itself lives in Firestore, never in this repo.

  python3 build.py            # all directories
  python3 build.py d3-2026    # just one
"""
import json, subprocess, sys, tempfile, time
from html import escape
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
BASE_URL = 'https://yaelavgil.github.io/class-directory/'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
COLORS = {  # page background, icon colour
    'sky': ('#d9e0f0', '#4f6fb3'), 'pink': ('#f4dfe5', '#b5567a'), 'mint': ('#d8eedf', '#3d8a5d'),
    'sand': ('#f2e9d6', '#a8742a'), 'lilac': ('#e4ddf2', '#7553b0'),
}
VER = time.strftime('%Y%m%d%H%M')
tpl = lambda name: (ROOT / 'templates' / name).read_text(encoding='utf-8')


def fill(t, **kw):
    for k, v in kw.items():
        t = t.replace('{' + k + '}', v)
    return t


def shoot(html, out_png, w, h):
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                    '--virtual-time-budget=6000', f'--window-size={w},{h}', f'--screenshot={out_png}', f'file://{f.name}'],
                   check=True, capture_output=True)
    Path(f.name).unlink()


def short_of(d):
    return d.get('short') or d['title'].replace('כיתה', '').strip()[:3]


def build_dir(d):
    out = ROOT / d['id']
    out.mkdir(exist_ok=True)
    bg, accent = COLORS.get(d.get('color', 'sky'), COLORS['sky'])
    title = f"דף קשר · {d['title']}"
    short = short_of(d)
    desc = f"{d.get('year', '')} · טלפונים, כתובות וימי הולדת של ילדי הכיתה. הכניסה להורים ולילדי הכיתה בלבד.".strip(' ·')
    (out / 'index.html').write_text(fill(tpl('page.html'),
        TITLE=escape(title), DESC=escape(desc), URL=f"{BASE_URL}{d['id']}/", VER=VER, SHORT_TITLE=escape(short),
        BG=bg, BASE='../', DIR_JSON=json.dumps(d['id'])), encoding='utf-8')

    # WhatsApp / social preview
    png = out / 'og.png'
    shoot(fill(tpl('og.html'), BG=bg, TITLE=escape(d['title']), YEAR=escape(d.get('year', ''))), png, 1200, 630)
    Image.open(png).convert('RGB').save(out / 'og.jpg', quality=88)
    png.unlink()

    # Favicons: SVG for modern browsers, PNGs for Safari / home screen
    fs = 300 if len(short) <= 2 else 220
    (out / 'icon.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{accent}"/>'
        f'<text x="256" y="268" text-anchor="middle" dominant-baseline="middle" direction="rtl" font-family="Rubik,Arial Hebrew,Arial,sans-serif" '
        f'font-weight="700" font-size="{fs}" fill="#fff">{escape(short)}</text></svg>', encoding='utf-8')
    big = out / 'icon-512.png'
    shoot(fill(tpl('icon.html'), ACCENT=accent, FS=str(fs), SHORT=escape(short)), big, 512, 512)
    im = Image.open(big).convert('RGBA')
    im.resize((180, 180), Image.LANCZOS).save(out / 'apple-touch-icon.png')
    im.resize((32, 32), Image.LANCZOS).save(out / 'favicon-32.png')
    print('built', d['id'])


def build_root():
    (ROOT / 'index.html').write_text(fill(tpl('page.html'),
        TITLE='דפי קשר', DESC='דפי קשר לכיתות: טלפונים, כתובות וימי הולדת. הכניסה למורשים בלבד.', URL=BASE_URL, VER=VER,
        SHORT_TITLE='דפי קשר', BG=COLORS['sky'][0], BASE='./', DIR_JSON='null')
        .replace('og.jpg', 'd3-2026/og.jpg').replace('icon.svg', 'd3-2026/icon.svg')
        .replace('favicon-32.png', 'd3-2026/favicon-32.png').replace('apple-touch-icon.png', 'd3-2026/apple-touch-icon.png'),
        encoding='utf-8')


if __name__ == '__main__':
    dirs = json.loads((ROOT / 'dirs.json').read_text(encoding='utf-8'))
    only = set(sys.argv[1:])
    for d in dirs:
        if not only or d['id'] in only:
            build_dir(d)
    build_root()
