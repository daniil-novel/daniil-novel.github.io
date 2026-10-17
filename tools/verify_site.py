"""Check the built release for broken local links, missing files and HTML IDs."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json

ROOT=Path(__file__).resolve().parent.parent/'dist'
class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.refs=[];self.images=[];self.external=[];self.pdfs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id'in a:self.ids.append(a['id'])
        for field in ['href','src']:
            if a.get(field):self.refs.append((tag,a[field]))
        if tag=='img' and a.get('src'):self.images.append((a.get('alt'),a['src']))
        if tag=='a' and a.get('href','').startswith('https://'):self.external.append(a)
        if tag=='a' and a.get('href','').endswith('.pdf'):self.pdfs.append(a)
p=Page();p.feed((ROOT/'index.html').read_text(encoding='utf-8'))
errors=[]
if len(p.ids)!=len(set(p.ids)):errors.append('Duplicate HTML IDs')
for tag,ref in p.refs:
    parsed=urlsplit(ref)
    if parsed.scheme or parsed.netloc:continue
    if parsed.path:
        path=(ROOT/unquote(parsed.path)).resolve()
        if not path.is_relative_to(ROOT.resolve()) or not path.is_file():errors.append('Missing local reference: '+ref)
    elif parsed.fragment and parsed.fragment not in p.ids:errors.append('Missing anchor: '+ref)
for alt,src in p.images:
    if not alt:errors.append('Image needs alt text: '+src)
for link in p.external:
    if link.get('target')=='_blank' and 'noopener' not in link.get('rel',''):errors.append('Unsafe new-tab link: '+link['href'])
required=['daniil-privezentsev-cv.pdf','research-proposal.pdf','agent-granularity-working-paper.pdf']
for name in required:
    file=ROOT/'documents'/name
    if not file.is_file() or not file.read_bytes().startswith(b'%PDF'):errors.append('Invalid PDF: '+name)
for forbidden in ['source','preview','.git']:
    if (ROOT/forbidden).exists():errors.append('Non-public material in release: '+forbidden)
size=sum(f.stat().st_size for f in ROOT.rglob('*') if f.is_file())
result={'errors':errors,'local_references':len(p.refs),'external_links':len(p.external),'pdf_links':len(p.pdfs),'release_bytes':size}
print(json.dumps(result,indent=2))
if errors:raise SystemExit(1)
