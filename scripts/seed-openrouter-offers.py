#!/usr/bin/env python3
"""Seed 25 OpenRouter supplier offers from live published token prices.

Requires NIU_ADMIN_TOKEN and an existing OpenRouter supplier and vendor.
Existing offers and model routes are preserved. Does not settle past requests.
Selection informed by https://openrouter.ai/rankings (2026-09-29), with major
provider coverage; this is a curated starter list, not an exact top-25 ranking.
"""
import argparse
import json
import os
from decimal import Decimal
from urllib.request import Request, urlopen

MODELS = '''deepseek/deepseek-v4.1-flash
google/gemini-2.5-flash
z-ai/glm-5.3-flash
tencent/hy4-preview
openai/gpt-5.6-luna
deepseek/deepseek-v4-flash-0731
xiaomi/mimo-v2.6-flash
nvidia/nemotron-3-ultra-550b-a55b
openai/gpt-6-luna
deepseek/deepseek-v4-flash
anthropic/claude-sonnet-5.5
anthropic/claude-opus-5.5
anthropic/claude-fable-5.1
anthropic/claude-fable-5
openai/gpt-6-sol
openai/gpt-6-astra
openai/gpt-5.6-sol
openai/gpt-4.1-mini
google/gemini-3.1-pro-preview
google/gemini-3.1-flash-lite
qwen/qwen3.8-max-0902
qwen/qwen3.8-flash
z-ai/glm-5.3
x-ai/grok-4.7
xiaomi/mimo-v2.6-pro'''.splitlines()


def rate(value):
    # OpenRouter: USD/token; Niu: USD nanounits per million tokens.
    result = Decimal(value) * Decimal(10**15)
    if (not result.is_finite() or result < 0 or result > 10**15
            or result != result.to_integral_value()):
        raise ValueError('Unsupported token price')
    return str(int(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vendor-name', help='Choose the existing demo API-key configuration by its exact saved name.')
    parser.add_argument('--metadata-only', action='store_true', help='Refresh descriptions on existing routes without Supplier or pricing operations.')
    parser.add_argument('--check', action='store_true', help='Verify all existing routes and public rates without configuration writes.')
    parser.add_argument('--refresh-rates', action='store_true',
                        help='Publish new revisions for changed public USD rates; preserve historical rates and leave changed offers inactive.')
    args = parser.parse_args()
    if args.metadata_only and (args.check or args.refresh_rates):
        parser.error('--metadata-only cannot be combined with rate or check operations')
    if args.check and args.refresh_rates:
        parser.error('--check cannot be combined with --refresh-rates')
    base = os.environ.get('NIU_ADMIN_URL', 'http://127.0.0.1:2566').rstrip('/')
    token = os.environ['NIU_ADMIN_TOKEN']
    def api(path, body=None, method=None):
        req = Request(base + path, data=None if body is None else json.dumps(body).encode(), method=method, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urlopen(req, timeout=30) as response:
            return None if response.status == 204 else json.load(response)['data']
    with urlopen('https://openrouter.ai/api/v1/models', timeout=30) as response:
        catalog = {model['id']: model for model in json.load(response)['data']}
    if args.metadata_only:
        vendors = [v for v in api('/admin/v1/vendors') if v['adapter'] == 'openrouter']
        selected = select_demo_vendor(vendors, args.vendor_name)
        vendor = selected['id']
        routes = api(f'/admin/v1/vendors/{vendor}/models')
        planned = []
        for route in routes:
            upstream = catalog.get(route['upstream_model'])
            if upstream is None:
                continue
            capabilities = route.get('capabilities') or {}
            metadata = refreshed_metadata(capabilities.get('catalog'), upstream)
            if metadata != capabilities.get('catalog'):
                planned.append(dict(alias=route['alias'], upstream_model=route['upstream_model'],
                    enabled=route['enabled'], public_catalog=route['public_catalog'],
                    expected_revision=route['revision'], capabilities={**capabilities, 'catalog':metadata}))
        for update in planned:
            api(f'/admin/v1/vendors/{vendor}/models', update)
        print(f'Refreshed descriptive metadata for {len(planned)} existing routes. Supplier offers and rates unchanged.')
        return
    suppliers = [p for p in api('/admin/v1/providers') if p['name'].casefold() == 'openrouter']
    vendors = [v for v in api('/admin/v1/vendors') if v['adapter'] == 'openrouter']
    if len(suppliers) != 1:
        raise ValueError('Expected exactly one OpenRouter demo Supplier business')
    selected = select_demo_vendor(vendors, args.vendor_name)
    supplier, vendor = suppliers[0]['id'], selected['id']
    routes = {m['alias']: m for m in api(f'/admin/v1/vendors/{vendor}/models')}
    existing = api(f'/admin/v1/providers/{supplier}/administration')['offers']
    offers = {o['model_alias'] for o in existing}
    # Validate the entire selected set before writing anything.
    prices = {m: (rate(catalog[m]['pricing']['prompt']), rate(catalog[m]['pricing']['completion'])) for m in MODELS}
    updates = plan_rate_updates(existing, prices, args.refresh_rates)
    verify_routes(routes, MODELS)
    if args.check:
        verify_check_state(routes, existing, prices, api(f'/admin/v1/vendors/{vendor}/supplier'), supplier)
        print(f'Verified {len(MODELS)} existing model mappings and current public token rates. No configuration writes or inference calls. Qualification and discounted supply remain separate.')
        return
    api(f'/admin/v1/vendors/{vendor}/supplier', {
        'supplier_id': supplier, 'expected_revision': selected['revision'],
    }, method='PUT')
    for update in updates:
        api(f'/admin/v1/providers/{supplier}/offers', update)
    created = 0
    for model in MODELS:
        if model not in routes:
            api(f'/admin/v1/vendors/{vendor}/models', {'alias': model, 'upstream_model': model, 'enabled': True, 'public_catalog': True, 'capabilities': {'catalog': descriptive_metadata(catalog[model])}})
        elif refreshed_metadata((routes[model].get('capabilities') or {}).get('catalog'), catalog[model]) != (routes[model].get('capabilities') or {}).get('catalog'):
            route = routes[model]
            api(f'/admin/v1/vendors/{vendor}/models', {
                'alias': model, 'upstream_model': route['upstream_model'],
                'enabled': route['enabled'], 'public_catalog': route['public_catalog'],
                'capabilities': {**(route.get('capabilities') or {}), 'catalog': refreshed_metadata((route.get('capabilities') or {}).get('catalog'), catalog[model])},
                'expected_revision': route['revision'],
            })
        if model in offers:
            continue
        prompt, completion = prices[model]
        api(f'/admin/v1/providers/{supplier}/offers', {'model_alias': model, 'currency': 'USD', 'prompt_rate': prompt, 'completion_rate': completion, 'expected_revision': None})
        created += 1
    actual = api(f'/admin/v1/providers/{supplier}/administration')['offers']
    assert all(m in {o['model_alias'] for o in actual} for m in MODELS)
    verify_existing_rates(actual, prices)
    print(
        f'Created {created} offer records; refreshed {len(updates)} rate revisions; verified public token rates for all {len(MODELS)} aliases. '
        'This checks catalog presence only; it does not qualify resale rights or establish a discount. '
        'Existing offers preserved.'
    )


def select_demo_vendor(vendors, name=None):
    matches = [vendor for vendor in vendors if name is None or vendor['name'] == name]
    if len(matches) != 1:
        raise ValueError('Choose exactly one existing demo API-key configuration with --vendor-name')
    return matches[0]


def verify_existing_rates(offers, prices):
    """Validate current offers without rewriting historical agreed prices.

    The administration endpoint returns one current revision per offer;
    revision identifiers are opaque and must never be ordered numerically.
    """
    latest = {}
    for offer in offers:
        alias = offer['model_alias']
        if alias in latest:
            raise ValueError(f'Ambiguous current offers for {alias}')
        latest[alias] = offer
    for alias, expected in prices.items():
        offer = latest.get(alias)
        if offer is None:
            raise ValueError(f'Missing expected offer for {alias}; no saved public rate to verify')
        if (offer['currency'] != 'USD' or
                (str(offer['prompt_rate']), str(offer['completion_rate'])) != expected):
            raise ValueError(f'Public rates changed for {alias}; publish a reviewed new rate revision before seeding')


def plan_rate_updates(offers, prices, refresh=False):
    """Validate the full snapshot before publishing revision-checked updates."""
    current = {}
    for offer in offers:
        alias = offer['model_alias']
        if alias in current:
            raise ValueError(f'Ambiguous current offers for {alias}')
        current[alias] = offer
    updates = []
    for alias, (prompt, completion) in prices.items():
        offer = current.get(alias)
        if offer is None:
            continue
        if offer['currency'] != 'USD':
            raise ValueError(f'Currency differs for {alias}; review the agreement before refreshing')
        if (str(offer['prompt_rate']), str(offer['completion_rate'])) == (prompt, completion):
            continue
        if not refresh:
            raise ValueError(f'Public rates changed for {alias}; use --refresh-rates to publish new test rate revisions')
        updates.append(dict(model_alias=alias, currency='USD', prompt_rate=prompt,
                            completion_rate=completion, expected_revision=offer['revision']))
    return updates


def verify_check_state(routes, offers, prices, vendor, supplier):
    if not vendor or vendor.get('id') != supplier:
        raise ValueError('Existing OpenRouter adapter is not associated with the test Supplier')
    if any(model not in routes for model in prices):
        raise ValueError('Missing expected model mappings; check mode will not create them')
    verify_routes(routes, prices)
    verify_existing_rates(offers, prices)


def refreshed_metadata(existing, upstream):
    """Repair a demonstrably truncated upstream description, not custom copy."""
    fresh = descriptive_metadata(upstream)
    if not existing:
        return fresh
    result = dict(existing)
    previous = existing.get('description')
    complete = fresh.get('description')
    if isinstance(previous, str) and isinstance(complete, str):
        suffix = '...' if previous.endswith('...') else '…' if previous.endswith('…') else None
        if suffix:
            prefix = previous[:-len(suffix)].rstrip()
            if prefix and complete.startswith(prefix) and len(complete) > len(previous):
                result['description'] = complete
    return result


def descriptive_metadata(model):
    """Copy provider facts only; advertised purchase prices are not retail tariffs."""
    result = {}
    for field, maximum in [('name', 300), ('description', 12000)]:
        value = model.get(field)
        if isinstance(value, str) and value and len(value.encode()) <= maximum:
            result[field] = value
    for field, value in [('context_length', model.get('context_length')),
                         ('max_completion_tokens', (model.get('top_provider') or {}).get('max_completion_tokens'))]:
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            result[field] = value
    architecture = model.get('architecture') or {}
    for field in ['input_modalities', 'output_modalities']:
        values = architecture.get(field, [])
        if isinstance(values, list):
            result[field] = [value for value in values[:16] if isinstance(value, str) and value and len(value.encode()) <= 40]
    return result


def verify_routes(routes, models):
    """Do not price an alias that routes to a different upstream model."""
    for model in models:
        route = routes.get(model)
        if route is not None and route['upstream_model'] != model:
            raise ValueError(f'Existing route differs from the public priced model: {model}')

if __name__ == '__main__':
    main()
