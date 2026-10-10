#!/usr/bin/env python3
"""Extract JSON OpenAPI annotations from Rust doc comments; no third-party parser."""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECURITY_SCHEMES = {
    'bearerAuth': {'type': 'http', 'scheme': 'bearer'},
    'niuApiKeyAuth': {'type': 'apiKey', 'in': 'header', 'name': 'X-Niu-API-Key'},
}


def registered_methods(source):
    """Read literal Axum route builders; skip quoted strings and comments."""
    result = {}
    tokens = re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/|[()]', re.S)
    for route in re.finditer(r'\.route\(\s*"([^"\n]+)"', source):
        depth, end = 1, None
        for token in tokens.finditer(source, route.end()):
            if token.group() == '(':
                depth += 1
            elif token.group() == ')':
                depth -= 1
                if depth == 0:
                    end = token.start()
                    break
        if end is None:
            raise SystemExit(f'Unclosed route registration: {route[1]}')
        body = source[route.end():end]
        body = re.sub(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/', '', body, flags=re.S)
        methods = re.findall(r'\b(get|post|put|patch|delete|head|options)\s*\(', body)
        result.setdefault(route[1], set()).update(methods)
    return result


def validate_local_references(value, document):
    if isinstance(value, dict):
        # Unquoted commas in YAML flow descriptions can become null-valued
        # prose keys when migrating an operation to JSON annotations.
        if isinstance(value.get('description'), str):
            fragments = [key for key, child in value.items()
                         if child is None and any(char.isspace() for char in key)]
            if fragments:
                raise SystemExit(f'Description fragments must not be object keys: {fragments}')
        reference = value.get('$ref')
        if reference is not None:
            if not reference.startswith('#/'):
                raise SystemExit(f'Handler annotations require local references: {reference}')
            target = document
            for part in reference[2:].split('/'):
                part = part.replace('~1', '/').replace('~0', '~')
                if not isinstance(target, dict) or part not in target:
                    raise SystemExit(f'Unresolved OpenAPI reference: {reference}')
                target = target[part]
        for child in value.values():
            validate_local_references(child, document)
    elif isinstance(value, list):
        for child in value:
            validate_local_references(child, document)


def validate_schema_dialect(schema, location):
    """Reject the 3.0-only nullability keyword at schema nodes, not data fields."""
    if not isinstance(schema, dict):
        return  # JSON Schema also permits boolean schemas.
    if 'nullable' in schema:
        raise SystemExit(
            f'OpenAPI 3.1 schema at {location} uses nullable; '
            'include "null" in type or a composition branch instead')
    for keyword in ('properties', 'patternProperties', '$defs', 'dependentSchemas'):
        for name, child in schema.get(keyword, {}).items():
            validate_schema_dialect(child, f'{location}/{keyword}/{name}')
    for keyword in ('allOf', 'anyOf', 'oneOf', 'prefixItems'):
        for index, child in enumerate(schema.get(keyword, [])):
            validate_schema_dialect(child, f'{location}/{keyword}/{index}')
    for keyword in ('items', 'additionalProperties', 'unevaluatedProperties',
                    'unevaluatedItems', 'contains', 'propertyNames', 'not',
                    'if', 'then', 'else', 'contentSchema'):
        if keyword in schema:
            validate_schema_dialect(schema[keyword], f'{location}/{keyword}')


def validate_inline_schema_dialects(value, location):
    """Find OpenAPI schema fields without interpreting example payloads as schemas."""
    if isinstance(value, dict):
        for name, child in value.items():
            if name == 'schema':
                validate_schema_dialect(child, f'{location}/schema')
            elif name not in ('example', 'examples') and not name.startswith('x-'):
                validate_inline_schema_dialects(child, f'{location}/{name}')
    elif isinstance(value, list):
        for index, child in enumerate(value):
            validate_inline_schema_dialects(child, f'{location}/{index}')


def schema_block(schema):
    return ['```json', json.dumps(schema, indent=2), '```', '']


def operation_documentation(path, method, operation):
    lines = [f'## {operation["summary"]}', '', f'`{method.upper()} {path}`', '',
             operation['description'], '',
             f'Implementation: `{operation["x-niu-implementation"]}`. '
             f'Operation: `{operation["operationId"]}`.', '']
    if operation.get('x-niu-status'):
        lines.extend(['### Supported scope', '', operation['x-niu-status'], ''])
    lines.extend(['### Authentication', ''])
    security = operation.get('security')
    if security is None:
        lines.extend(['Not declared in this annotation; consult the behavior contract above.', ''])
    elif not security:
        lines.extend(['No OpenAPI security scheme is required. Signature and other request validation still apply as described above.', ''])
    else:
        lines.extend(['Each array entry is an alternative; schemes within one entry are required together.', ''])
        lines.extend(schema_block(security))
    if operation.get('parameters'):
        lines.extend(['### Parameters', ''])
        for parameter in operation['parameters']:
            required = 'required' if parameter.get('required') else 'optional'
            lines.extend([f'`{parameter["name"]}` ({parameter["in"]}, {required})', ''])
            if parameter.get('description'):
                lines.extend([parameter['description'], ''])
            lines.extend(schema_block(parameter['schema']))
    body = operation.get('requestBody')
    if body:
        lines.extend(['### Request body', '',
                      'Required.' if body.get('required') else 'Optional.', ''])
        if body.get('description'):
            lines.extend([body['description'], ''])
        for media_type, media in body.get('content', {}).items():
            lines.extend([f'Content type: `{media_type}`.', ''])
            lines.extend(schema_block(media['schema']))
    lines.extend(['### Responses', ''])
    for status, response in operation['responses'].items():
        lines.extend([f'HTTP {status}: {response["description"]}', ''])
        for name, header in response.get('headers', {}).items():
            lines.extend([f'Response header: `{name}`.', ''])
            if header.get('description'):
                lines.extend([header['description'], ''])
            lines.extend(schema_block(header.get('schema', header)))
        for media_type, media in response.get('content', {}).items():
            lines.extend([f'Content type: `{media_type}`.', ''])
            lines.extend(schema_block(media['schema']))
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    paths, names, descriptions, schemas = {}, set(), [], {}
    routes = registered_methods((ROOT / 'apps/gateway/src/web/routes.rs').read_text())
    for source in sorted((ROOT / 'apps/gateway/src').rglob('*.rs')):
        for block in re.findall(r'(?m)^/// ```openapi\n(.*?)^/// ```\s*$', source.read_text(), re.S):
            lines = block.splitlines()
            if not all(line.startswith('/// ') for line in lines):
                raise SystemExit(f'Malformed annotation in {source.relative_to(ROOT)}')
            value = json.loads('\n'.join(line[4:] for line in lines))
            for schema_name, schema in value.get('schemas', {}).items():
                validate_schema_dialect(schema, f'{source.relative_to(ROOT)}:schemas/{schema_name}')
                if schema_name in schemas and schemas[schema_name] != schema:
                    raise SystemExit(f'Conflicting shared schema: {schema_name}')
                schemas[schema_name] = schema
            path, method, operation = value['path'], value['method'], value['operation']
            name = operation['operationId']
            validate_inline_schema_dialects(operation, f'{source.relative_to(ROOT)}:{name}')
            if method not in {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}:
                raise SystemExit(f'Invalid HTTP method: {method}')
            if method not in routes.get(path, set()):
                raise SystemExit(f'Annotated operation is not registered: {method.upper()} {path}')
            if name in names or method in paths.get(path, {}):
                raise SystemExit(f'Duplicate operation: {name}')
            if operation.get('x-niu-implementation') not in {'implemented', 'stub'}:
                raise SystemExit(f'Missing implementation status: {name}')
            security = operation.get('security')
            if not isinstance(security, list):
                raise SystemExit(f'Missing explicit security requirements: {name}')
            for alternative in security:
                if not isinstance(alternative, dict):
                    raise SystemExit(f'Invalid security alternative: {name}')
                for scheme, scopes in alternative.items():
                    if scheme not in SECURITY_SCHEMES or scopes != []:
                        raise SystemExit(f'Unknown security scheme or unsupported scopes: {name}')
            if not operation.get('responses') or not operation.get('description'):
                raise SystemExit(f'Missing response or behavior contract: {name}')
            names.add(name)
            paths.setdefault(path, {})[method] = operation
            descriptions.extend(operation_documentation(path, method, operation))
    if not paths:
        raise SystemExit('No handler annotations found')
    if schemas:
        descriptions.extend(['## Shared schemas', '',
                             'Local `#/components/schemas/…` references resolve to these definitions.', ''])
        for name, schema in sorted(schemas.items()):
            descriptions.extend([f'### {name}', '', *schema_block(schema)])
    descriptions.extend(['## Authentication schemes', ''])
    for name, scheme in SECURITY_SCHEMES.items():
        descriptions.extend([f'### {name}', '', *schema_block(scheme)])
    spec = {'openapi': '3.1.0', 'info': {'title': 'Niu annotated handler operations', 'version': '0.1.0'},
            'paths': paths, 'components': {'schemas': schemas, 'securitySchemes': SECURITY_SCHEMES}}
    validate_local_references(spec, spec)
    outputs = {
        'contracts/generated/handler-operations.json': json.dumps(spec, indent=2) + '\n',
        'docs/reference/generated-api-operations.md': '\n'.join([
            '# Annotated API operations', '',
            'Generated by `scripts/extract-handler-openapi.py`. Do not edit directly.', '',
            'This is the annotated subset, not the complete API. See `contracts/openapi.yaml` for the root contract.', '',
            *descriptions,
        ]).rstrip() + '\n',
    }
    outputs['apps/docs/src/content/docs/reference/handler-operations.md'] = '\n'.join([
        '---',
        'title: Implemented API operations',
        'description: Handler-generated parameters, request bodies, responses and schemas.',
        '---', '',
        'Generated from backend handler annotations. Do not edit directly.', '',
        'This is the annotated subset, not the complete API. '
        'See the [API overview](/docs/reference/api/) and '
        '[root OpenAPI contract](https://github.com/niu-io/niu/blob/main/contracts/openapi.yaml) '
        'for the broader interface.', '',
        *descriptions,
    ]).rstrip() + '\n'
    for relative, content in outputs.items():
        target = ROOT / relative
        if args.check:
            if not target.exists() or target.read_text() != content:
                raise SystemExit(f'Generated file is stale: {relative}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
    print(f'Handler annotations: {len(names)} operations; generated contracts are current.')


if __name__ == '__main__':
    main()
