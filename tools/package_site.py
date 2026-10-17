"""Package a host-ready release, repository sources, and an offline review copy."""
from pathlib import Path
import base64
import hashlib
import json
import mimetypes
import re
import zipfile

ROOT=Path(__file__).resolve().parent.parent
DIST=ROOT/'dist'
page=(DIST/'index.html').read_text(encoding='utf-8')
manifest={}
def data(file):
    file=file.resolve()
    if not file.is_relative_to(ROOT):raise ValueError('Unexpected asset outside project')
    raw=file.read_bytes()
    mime={'.ttf':'font/ttf','.svg':'image/svg+xml','.pdf':'application/pdf'}.get(file.suffix,mimetypes.guess_type(file.name)[0])
    manifest[str(file.relative_to(ROOT))]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    return 'data:'+mime+';base64,'+base64.b64encode(raw).decode('ascii')
def css(m):
    file=DIST/m.group(1)
    text=file.read_text(encoding='utf-8-sig')
    text=re.sub(r'url\((["\']?)([^"\')]+)\1\)',lambda x:'url("'+data(file.parent/x.group(2))+'")',text)
    return '<style>\n'+text+'\n</style>'
page=re.sub(r'<link rel="stylesheet" href="([^"]+)">',css,page)
def attr(m):
    name,quote,path=m.group(1),m.group(2),m.group(3)
    file=DIST/path
    if path.startswith(('http:','https:','mailto:','tel:','#','data:','blob:')) or not file.is_file():return m.group(0)
    if file.suffix not in {'.jpg','.png','.svg','.ttf','.pdf'}:return m.group(0)
    if name=='href' and file.suffix in {'.png','.jpg'}:
        return 'data-image-name="'+file.name+'" '+name+'='+quote+data(file)+quote
    return name+'='+quote+data(file)+quote
page=re.sub(r'\b(src|href)=(["\'])([^"\']+)\2',attr,page)
# Keep local PDF downloads and image viewer links usable from a single file.
blob_script='''<script>(()=>{const cache=new Map();document.querySelectorAll('a[href^="data:"]').forEach(a=>{const value=a.getAttribute('href');if(!a.hasAttribute('download')&&!value.startsWith('data:image/'))return;let url=cache.get(value);if(!url){const split=value.indexOf(','),mime=value.slice(5,value.indexOf(';')),raw=atob(value.slice(split+1)),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);url=URL.createObjectURL(new Blob([bytes],{type:mime}));cache.set(value,url)}a.href=url})})();</script>'''
motion_script=(DIST/'assets/js/motion.js').read_text(encoding='utf-8-sig').replace('</script','<\\/script')
page=page.replace('<script src="assets/js/motion.js" defer></script>',blob_script+'\n<script>\n'+motion_script+'\n</script>')
site_script=(DIST/'assets/js/site.js').read_text(encoding='utf-8-sig').replace("const filename = new URL(link.href, location.href).pathname.split('/').pop();","const filename = link.dataset.imageName || new URL(link.href, location.href).pathname.split('/').pop();")
page=page.replace('<script src="assets/js/site.js" defer></script>','<script>\n'+site_script.replace('</script','<\\/script')+'\n</script>')
licenses='\n\n'.join(p.read_text(encoding='utf-8') for p in (DIST/'assets/fonts').glob('*-OFL.txt'))
page=page.replace('</head>','<!-- Embedded fonts are provided under the SIL Open Font License.\n'+licenses+'\n-->\n</head>')
offline=ROOT/'daniil-privezentsev-website.html'
offline.write_text(page,encoding='utf-8')
(ROOT/'source').mkdir(exist_ok=True)
(ROOT/'source/release-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
with zipfile.ZipFile(ROOT/'website-hosting.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in DIST.rglob('*'):
        if p.is_file():z.write(p,p.relative_to(DIST).as_posix())
with zipfile.ZipFile(ROOT/'website-github-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in ['index.html','404.html','README.md','.gitignore','.nojekyll']:
        z.write(ROOT/name,name)
    for folder in ['assets','documents','tools','.github']:
        for p in (ROOT/folder).rglob('*'):
            if p.is_file() and '__pycache__' not in p.parts:z.write(p,p.relative_to(ROOT).as_posix())
print(json.dumps({'offline_bytes':offline.stat().st_size,'hosting_zip_bytes':(ROOT/'website-hosting.zip').stat().st_size,'source_zip_bytes':(ROOT/'website-github-source.zip').stat().st_size}))
