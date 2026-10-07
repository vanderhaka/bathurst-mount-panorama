"""Regenerate checked-in HUD subsets using an existing FontTools installation.

No build-time dependency: npm run build reads the generated files. Preserve the
fonts' hinting, kerning, standard ligatures, tabular figures and licence metadata.
"""
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
FACES = [('barlow-condensed', 700), ('barlow-condensed', 800), ('barlow', 400), ('jetbrains-mono', 500)]
chars = {chr(n) for n in range(32, 127)}
for path in [ROOT / 'index.html', *(ROOT / 'src').rglob('*')]:
    if path.is_file() and path.suffix in {'.ts', '.css', '.html', '.json'}:
        chars.update(path.read_text())
options = subset.Options()
options.name_IDs = ['*']
options.name_languages = ['*']
options.layout_features = ['kern', 'liga', 'tnum']
options.flavor = 'woff'
for family, weight in FACES:
    source = ROOT / f'node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff'
    font = subset.load_font(str(source), options)
    job = subset.Subsetter(options=options)
    job.populate(unicodes={ord(char) for char in chars})
    job.subset(font)
    output = ROOT / f'src/hud/fonts/{family}-{weight}.woff'
    subset.save_font(font, str(output), options)
    print(f'{output.name}: {output.stat().st_size} bytes')
