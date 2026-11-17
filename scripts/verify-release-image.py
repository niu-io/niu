#!/usr/bin/env python3
"""Verify anonymous GHCR access, image bytes and source labels before release."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request


ACCEPT = ', '.join([
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
])


def read(url, headers=None):
    # No Docker credential helper or local login is consulted: public installation
    # must work for a new user, including after the first private-by-default push.
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(8 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Anonymous registry access failed: HTTP {error.code}') from None
    if len(data) > 8 * 1024 * 1024:
        raise RuntimeError('Registry metadata exceeds the size limit')
    return data


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def verify(image, commit, expected_digest):
    match = re.fullmatch(r'ghcr\.io/([a-z0-9._-]+/[a-z0-9._/-]+):([\w.-]+)', image)
    if not match or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise RuntimeError('Expected a GHCR version tag and complete source commit')
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', expected_digest):
        raise RuntimeError('Expected the digest returned by image publication')
    repository, tag = match.groups()
    query = urllib.parse.urlencode({'service': 'ghcr.io', 'scope': f'repository:{repository}:pull'})
    token = json.loads(read('https://ghcr.io/token?' + query))['token']
    headers = {'Authorization': 'Bearer ' + token, 'Accept': ACCEPT}
    base = f'https://ghcr.io/v2/{repository}'

    def blob(path, expected):
        raw = read(base + path, headers)
        if digest(raw) != expected:
            raise RuntimeError('Registry artifact does not match its content digest')
        return json.loads(raw)

    manifest = blob('/manifests/' + tag, expected_digest)
    required = {'linux/amd64', 'linux/arm64'}
    seen = set()
    for item in manifest.get('manifests', []):
        platform = item.get('platform', {})
        name = platform.get('os', '') + '/' + platform.get('architecture', '')
        if name not in required:
            continue  # Attestation manifests are not runtime architectures.
        if name in seen:
            raise RuntimeError('Duplicate runtime architecture in release image')
        child = blob('/manifests/' + item['digest'], item['digest'])
        config_digest = child['config']['digest']
        config = blob('/blobs/' + config_digest, config_digest)
        if config.get('os') != platform['os'] or config.get('architecture') != platform['architecture']:
            raise RuntimeError('Image configuration differs from the advertised platform')
        labels = config.get('config', {}).get('Labels', {})
        if labels.get('org.opencontainers.image.revision') != commit:
            raise RuntimeError('Runtime image source differs from the release source')
        if labels.get('org.opencontainers.image.source') != 'https://github.com/' + repository:
            raise RuntimeError('Runtime image does not identify its source repository')
        seen.add(name)
    if seen != required:
        raise RuntimeError('Release image must contain linux/amd64 and linux/arm64')
    return f'ghcr.io/{repository}@{expected_digest}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--digest', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    pinned = verify(args.image, args.commit, args.digest)
    args.output.write_text(pinned + '\n')
    print('Verified anonymous multi-platform image and source provenance: ' + pinned)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError, urllib.error.URLError) as error:
        raise SystemExit('Release image refused: ' + str(error)) from None
