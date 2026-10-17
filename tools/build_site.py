"""Build a static, host-independent release using only public website files."""
from pathlib import Path
import argparse
import re
import shutil
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--base-url', default='', help='Production origin and optional path, with HTTPS')
args=parser.parse_args()
base=args.base_url.strip().rstrip('/')+'/' if args.base_url.strip() else ''
if base:
    parsed=urlparse(base)
    if parsed.scheme!='https' or not parsed.hostname or parsed.query or parsed.fragment: raise SystemExit('Use an absolute HTTPS base URL without a query or fragment')
dist=ROOT/'dist'
dist.mkdir(exist_ok=True)
for folder in ['assets','documents']:
    shutil.copytree(ROOT/folder,dist/folder,dirs_exist_ok=True)
page=(ROOT/'index.html').read_text(encoding='utf-8-sig')
if base:
    page=page.replace('</head>',f'<link rel="canonical" href="{base}">\n<meta property="og:url" content="{base}">\n</head>')
    page=page.replace('content="assets/images/social-preview.jpg"',f'content="{base}assets/images/social-preview.jpg"')
(dist/'index.html').write_text(page,encoding='utf-8')
error=(ROOT/'404.html').read_text(encoding='utf-8')
if base:error=error.replace('href="/" data-home',f'href="{base}" data-home')
(dist/'404.html').write_text(error,encoding='utf-8')
(dist/'.nojekyll').write_text('',encoding='utf-8')
robots='User-agent: *\nAllow: /\n'
if base:
    robots+='Sitemap: '+base+'sitemap.xml\n'
    (dist/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+base+'</loc></url></urlset>\n',encoding='utf-8')
elif (dist/'sitemap.xml').is_file():
    (dist/'sitemap.xml').unlink()
(dist/'robots.txt').write_text(robots,encoding='utf-8')
print('Built static website in dist'+(' for '+base if base else ' (local preview)'))

