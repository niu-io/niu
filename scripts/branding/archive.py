"""Package only the declared public brand assets and their source notices."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / 'branding/rounded'
manifest = json.loads((KIT / 'manifest.json').read_text())
files = ['README.md', 'LICENSE.txt', 'manifest.json']
for record in manifest['sources'] + manifest['assets']:
    relative = Path(record['file'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Archive paths must remain inside the brand kit')
    content = (KIT / relative).read_bytes()
    if hashlib.sha256(content).hexdigest() != record['sha256']:
        raise ValueError(f'Checksum mismatch: {relative}')
    files.append(relative.as_posix())
archive = ROOT / 'branding/niu-rounded-brand-kit.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for name in sorted(set(files)):
        info = zipfile.ZipInfo('niu-rounded-brand-kit/' + name, date_time=(2026, 10, 29, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        output.writestr(info, (KIT / name).read_bytes(), compresslevel=9)
with zipfile.ZipFile(archive) as output:
    if output.testzip() is not None:
        raise ValueError('Archive integrity check failed')
print(f'Packaged {len(set(files))} files: {archive.relative_to(ROOT)}')
