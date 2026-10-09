"""Packaged deployment branding lifecycle, with synthetic raster assets only."""
import base64
import copy
import json
import struct
import urllib.error
import zlib

ADMIN = '/admin/v1/platform/branding'
PUBLIC = '/v1/branding'


def png_asset():
    def chunk(kind, value):
        return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(b'\x00\xff\x80\x00\xff')) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


def audit_snapshot(database):
    return database("SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY revision)::text,'[]') FROM branding_configuration_events e")


def assert_branding(request, database, saved):
    for path, kwargs in [(PUBLIC, {}), (ADMIN, {'admin': True})]:
        status, value, _ = request('GET', path, **kwargs)
        assert status == 200 and value['data'] == saved['configuration'], 'branding changed across lifecycle'
    assert audit_snapshot(database) == saved['audit'], 'branding audit changed across lifecycle'


def prepare_branding(request, database):
    status, initial, _ = request('GET', ADMIN, admin=True)
    assert status == 200
    initial = initial['data']
    settings = copy.deepcopy(initial['settings'])
    settings.update(display_name='Packaged deployment', default_appearance='dark',
                    light={'primary': '#112233'}, dark={'primary': '#f0f0f0'},
                    logo_data_url=png_asset(), favicon_data_url=png_asset())
    payload = {'expected_revision': initial['revision'], 'settings': settings}
    status, value, _ = request('PUT', ADMIN, admin=True, payload=payload)
    assert status == 200 and int(value['data']['revision']) == int(initial['revision']) + 1
    normalized = value['data']['settings']
    assert normalized['display_name'] == settings['display_name']
    assert normalized['light'] == settings['light'] and normalized['dark'] == settings['dark']
    assert normalized['default_appearance'] == 'dark'
    for field in ['logo_data_url', 'favicon_data_url']:
        assert normalized[field].startswith('data:image/png;base64,')
        assert base64.b64decode(normalized[field].split(',', 1)[1], validate=True).startswith(b'\x89PNG\r\n\x1a\n')
    saved = {'configuration': value['data'], 'audit': audit_snapshot(database), 'defaults': initial['settings']}
    try:
        request('PUT', ADMIN, admin=True, payload=payload)
    except urllib.error.HTTPError as error:
        assert error.code == 409, 'stale branding save did not conflict'
        error.close()
    else:
        raise AssertionError('stale branding save was accepted')
    assert_branding(request, database, saved)
    audit = json.loads(saved['audit'])
    assert audit[-1]['settings'] == normalized
    assert str(audit[-1]['revision']) == value['data']['revision']
    return saved


def reset_branding(request, saved):
    status, value, _ = request('PUT', ADMIN, admin=True, payload={
        'expected_revision': saved['configuration']['revision'], 'settings': saved['defaults']})
    assert status == 200 and value['data']['settings'] == saved['defaults']
    assert int(value['data']['revision']) == int(saved['configuration']['revision']) + 1
    status, public, _ = request('GET', PUBLIC)
    assert status == 200 and public == value, 'public branding did not reset'
