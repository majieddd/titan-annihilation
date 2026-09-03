"""Download CC0 PBR texture sets from ambientCG and pack them for the game.
assets/tex/<kind>/{color,normal,rough,ao,height,emission}.jpg  (1024, for hosting)
assets/tex-embed/<kind>/...                                       (768, embedded into standalone builds)
"""
import io, os, sys, zipfile, urllib.request
from PIL import Image
SETS = {'grass': 'Grass004', 'rock': 'Rock051', 'sand': 'Ground093C', 'snow': 'Snow010A', 'ice': 'Ice003', 'crust': 'Lava004', 'dust': 'Gravel043', 'panel': 'MetalPlates006', 'bark': 'Bark012'}
MAPS = {'color': '_Color', 'normal': '_NormalGL', 'rough': '_Roughness', 'ao': '_AmbientOcclusion', 'height': '_Displacement', 'emission': '_Emission'}
GRAY = {'rough', 'ao', 'height'}
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
credits = ['# Texture credits', '', 'All texture sets below are from [ambientCG](https://ambientcg.com), released under CC0 1.0 (public domain).', '']
for kind, aid in SETS.items():
    url = f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (titan-annihilation asset fetch)'})
    data = urllib.request.urlopen(req, timeout=180).read()
    z = zipfile.ZipFile(io.BytesIO(data)); names = z.namelist(); got = []
    for m, suffix in MAPS.items():
        name = next((n for n in names if n.lower().endswith((suffix + '.jpg').lower()) or n.lower().endswith((suffix + '.png').lower())), None)
        if not name: continue
        im = Image.open(io.BytesIO(z.read(name))); im = im.convert('L') if m in GRAY else im.convert('RGB')
        for outdir, size, q in (('assets/tex', 1024, 82), ('assets/tex-embed', 768, 58)):
            d = os.path.join(root, outdir, kind); os.makedirs(d, exist_ok=True)
            im.resize((size, size), Image.LANCZOS).save(os.path.join(d, m + '.jpg'), quality=q, optimize=True)
        got.append(m)
    credits.append(f'- `{kind}`: {aid} ({", ".join(got)})')
    print(kind, aid, got, f'{len(data)//1024} KB zip', flush=True)
open(os.path.join(root, 'assets', 'tex', 'CREDITS.md'), 'w').write('\n'.join(credits) + '\n')
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(os.path.join(root, 'assets', 'tex-embed')) for f in fs)
print('embed total KB', tot // 1024)
