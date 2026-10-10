#!/usr/bin/env python3
"""Read an existing video through Niu and independently decode its final artifact.

No generation, refresh, key mutation or financial mutation is requested. This is
an opt-in current-input check, not a fixture suite or a billing qualification.
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid


class VerificationError(Exception):
    pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--job', required=True, type=uuid.UUID)
    parser.add_argument('--output-dir', required=True, type=Path,
                        help='New private directory; existing paths are never overwritten')
    parser.add_argument('--api-key-env', default='NIU_API_KEY')
    parser.add_argument('--timeout', default=90, type=int)
    args = parser.parse_args()
    base = urlsplit(args.base_url)
    if (base.scheme not in ('http', 'https') or not base.hostname
            or base.username or base.password or base.query or base.fragment
            or base.path not in ('', '/')):
        raise VerificationError('Use an HTTP(S) gateway origin without credentials or a path')
    if base.scheme == 'http' and base.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise VerificationError('Remote gateways require HTTPS')
    if not 1 <= args.timeout <= 120:
        raise VerificationError('Timeout must be between 1 and 120 seconds')
    token = os.environ.get(args.api_key_env, '')
    if not token or token.strip() != token or any(ord(c) < 32 or ord(c) == 127 for c in token):
        raise VerificationError('The API key environment variable is missing or invalid')
    binaries = {name: shutil.which(name) for name in ('ffprobe', 'ffmpeg')}
    if not all(binaries.values()):
        raise VerificationError('ffprobe and ffmpeg must be installed')
    # A redirect must never forward a workspace secret to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    client = urllib.request.build_opener(NoRedirect())
    origin = args.base_url.rstrip('/')
    path = '/v1/video/jobs/' + str(args.job)

    def get(suffix):
        request = urllib.request.Request(origin + path + suffix,
                                         headers={'Authorization': 'Bearer ' + token})
        try:
            return client.open(request, timeout=args.timeout)
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise VerificationError(f'Gateway read failed with HTTP {status}') from None
        except (urllib.error.URLError, TimeoutError):
            raise VerificationError('Gateway read failed before a complete response') from None

    def read_json(suffix):
        with get(suffix) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise VerificationError('Metadata exceeds 64 KiB')
        try:
            return json.loads(raw)
        except (ValueError, UnicodeError):
            raise VerificationError('Gateway metadata is not JSON') from None

    state = read_json('')
    if (not isinstance(state, dict) or state.get('status') != 'succeeded'
            or state.get('id') != str(args.job)):
        raise VerificationError('Saved job is not in succeeded state')
    billing = read_json('/billing')
    if not isinstance(billing, dict):
        raise VerificationError('Saved billing is not an object')
    args.output_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    media = args.output_dir / 'result.bin'
    digest = hashlib.sha256()
    size = 0
    started = time.monotonic()
    with get('/results/video') as response, media.open('xb') as target:
        os.chmod(media, 0o600)
        content_type = response.headers.get_content_type()
        if response.status != 200 or content_type not in ('video/mp4', 'video/webm'):
            raise VerificationError('Expected a complete supported video response')
        directives = {item.strip().lower() for item in response.headers.get('Cache-Control', '').split(',')}
        if 'no-store' not in directives or response.headers.get('X-Content-Type-Options', '').lower() != 'nosniff':
            raise VerificationError('Private media response is missing its cache or sniffing boundary')
        while chunk := response.read1(64 * 1024):
            if time.monotonic() - started > args.timeout:
                raise VerificationError('Video download exceeded its time bound')
            size += len(chunk)
            if size > 64 * 1024 * 1024:
                raise VerificationError('Video exceeds the 64 MiB download bound')
            digest.update(chunk)
            target.write(chunk)
    elapsed = time.monotonic() - started
    probe = subprocess.run([binaries['ffprobe'], '-v', 'error', '-show_entries',
                            'format=duration,size:stream=codec_type,codec_name,width,height',
                            '-of', 'json', str(media)], capture_output=True, timeout=args.timeout)
    if probe.returncode:
        raise VerificationError('Independent media probe failed')
    metadata = json.loads(probe.stdout)
    video_streams = [stream for stream in metadata.get('streams', [])
                     if stream.get('codec_type') == 'video'
                     and stream.get('width', 0) > 0 and stream.get('height', 0) > 0]
    if (not video_streams or int(metadata['format']['size']) != size
            or not float(metadata['format']['duration']) > 0):
        raise VerificationError('Media has no measurable video stream or size disagrees')
    decode = subprocess.run([binaries['ffmpeg'], '-v', 'error', '-i', str(media),
                             '-map', '0:v:0', '-f', 'null', '-'],
                            capture_output=True, timeout=args.timeout)
    if decode.returncode or decode.stderr:
        raise VerificationError('Independent full video decode failed')
    report = {'http_status': 200, 'content_type': content_type, 'bytes': size,
              'sha256': digest.hexdigest(), 'download_seconds': elapsed,
              'media': metadata, 'full_video_decode': True,
              'billing_mode': billing.get('mode'), 'billing_state': billing.get('state'),
              'qualification': 'Saved-result delivery only; no generation or settlement claim'}
    with (args.output_dir / 'evidence.json').open('x') as output:
        os.chmod(args.output_dir / 'evidence.json', 0o600)
        json.dump(report, output, indent=2)
        output.write('\n')
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except VerificationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, http.client.HTTPException, subprocess.TimeoutExpired):
        # Do not print exception bodies: transport/provider text may contain
        # private URLs, local paths or content. Artifacts remain private.
        print('Video result verification did not complete; inspect the gateway and private output directory.', file=sys.stderr)
        sys.exit(1)
