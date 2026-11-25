export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type OperationAuthMode = 'public' | 'workspace-key' | 'session' | 'manual';

export interface OperationParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description: string;
  defaultValue: string;
  enumValues?: string[];
  type: string;
}

export interface OperationResponseSummary {
  status: string;
  description: string;
}

export interface OperationDescriptor {
  slug: string;
  method: HttpMethod;
  route: string;
  operationId: string;
  summary: string;
  description: string;
  tag: string;
  tagGroup: string;
  authMode: OperationAuthMode;
  requiredCapability: string;
  mutating: boolean;
  supportsModelPicker: boolean;
  parameters: OperationParameter[];
  mediaType: string | null;
  isBinaryBody: boolean;
  bodyRequired: boolean;
  defaultBody: string;
  responses: OperationResponseSummary[];
}

export interface OperationGroup {
  name: string;
  operations: OperationDescriptor[];
}

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: Record<string, Record<string, unknown>>;
  security?: Array<Record<string, unknown>>;
  'x-tagGroups'?: Array<{ name: string; tags: string[] }>;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

const MODEL_PICKER_ROUTES = new Set([
  '/v1/chat/completions',
  '/v1/responses',
  '/v1/messages',
  '/v1/embeddings',
  '/v1/decisions',
  '/v1/video/generations',
  '/v1beta/models/{model_action}',
]);

export function operationSlug(method: string, route: string, operationId?: string): string {
  return (operationId || `${method.toLowerCase()}-${route}`)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .toLowerCase();
}

export function resolvePointer(doc: OpenApiDocument, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .reduce<unknown>((acc, rawKey) => {
      if (!acc || typeof acc !== 'object') return undefined;
      const key = rawKey.replace(/~1/g, '/').replace(/~0/g, '~');
      return (acc as Record<string, unknown>)[key];
    }, doc);
}

function deref(doc: OpenApiDocument, value: unknown, seen = new Set<string>()): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string') {
    if (seen.has(record.$ref)) return undefined;
    const target = resolvePointer(doc, record.$ref);
    if (!target || typeof target !== 'object' || Array.isArray(target)) return undefined;
    const nextSeen = new Set(seen);
    nextSeen.add(record.$ref);
    return deref(doc, { ...(target as Record<string, unknown>), ...record, $ref: undefined }, nextSeen);
  }
  return record;
}

function synthesizeExample(doc: OpenApiDocument, rawSchema: unknown, depth = 0, seen = new Set<string>()): unknown {
  if (depth > 4) return {};
  const schema = deref(doc, rawSchema, seen);
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return synthesizeExample(doc, schema.oneOf[0], depth + 1, seen);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const nonNull = schema.anyOf.find((entry) => {
      const resolved = deref(doc, entry, seen);
      return resolved?.type !== 'null';
    });
    return synthesizeExample(doc, nonNull ?? schema.anyOf[0], depth + 1, seen);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const part of schema.allOf) {
      const value = synthesizeExample(doc, part, depth + 1, seen);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(merged, value);
      }
    }
    return merged;
  }

  const rawType = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null') ?? 'string'
    : schema.type;

  if (rawType === 'object' || schema.properties) {
    const result: Record<string, unknown> = {};
    const props = (schema.properties ?? {}) as Record<string, unknown>;
    const required = new Set<string>(Array.isArray(schema.required) ? schema.required.map(String) : []);
    const keys = required.size > 0
      ? [...required].filter((k) => Object.hasOwn(props, k))
      : Object.keys(props).slice(0, 5);
    for (const key of keys) {
      result[key] = synthesizeExample(doc, props[key], depth + 1, seen);
    }
    return result;
  }
  if (rawType === 'array') {
    return schema.items ? [synthesizeExample(doc, schema.items, depth + 1, seen)] : [];
  }
  if (rawType === 'integer' || rawType === 'number') return 1;
  if (rawType === 'boolean') return false;
  if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
  if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
  return '';
}

function starterJsonBody(route: string, method: HttpMethod, schema: unknown, doc: OpenApiDocument): string {
  if (method === 'POST' && route === '/v1/chat/completions') {
    return JSON.stringify(
      {
        model: '',
        messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
        max_tokens: 64,
        stream: false,
      },
      null,
      2,
    );
  }
  if (method === 'POST' && route === '/v1/responses') {
    return JSON.stringify(
      {
        model: '',
        input: 'Say hello in one sentence.',
        max_output_tokens: 64,
      },
      null,
      2,
    );
  }
  if (method === 'POST' && route === '/v1/messages') {
    return JSON.stringify(
      {
        model: '',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      },
      null,
      2,
    );
  }
  if (method === 'POST' && route === '/v1/embeddings') {
    return JSON.stringify(
      {
        model: '',
        input: 'The Model Platform for Agents.',
      },
      null,
      2,
    );
  }
  if (method === 'POST' && route === '/v1beta/models/{model_action}') {
    return JSON.stringify(
      {
        contents: [{ role: 'user', parts: [{ text: 'Say hello in one sentence.' }] }],
        generationConfig: { maxOutputTokens: 64 },
      },
      null,
      2,
    );
  }
  if (method === 'POST' && route === '/v1/decisions') {
    return JSON.stringify(
      {
        model: '',
        messages: [{ role: 'user', content: 'Classify the urgency of: production checkout is returning 503.' }],
        schema: {
          type: 'object',
          required: ['urgency'],
          properties: {
            urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          additionalProperties: false,
        },
      },
      null,
      2,
    );
  }
  const synthesized = synthesizeExample(doc, schema);
  return JSON.stringify(synthesized ?? {}, null, 2);
}

function deriveAuthMode(
  route: string,
  operation: Record<string, unknown>,
  doc: OpenApiDocument,
): { authMode: OperationAuthMode; requiredCapability: string } {
  const authority = (operation['x-niu-authority'] ?? {}) as {
    principals?: unknown;
    required_capability?: unknown;
  };
  const principals = Array.isArray(authority.principals)
    ? authority.principals.map(String)
    : [];
  const requiredCapability =
    typeof authority.required_capability === 'string'
      ? authority.required_capability
      : '';

  const security = Array.isArray(operation.security)
    ? operation.security
    : Array.isArray(doc.security)
      ? doc.security
      : [];

  if (principals.includes('anonymous') || security.length === 0) {
    return { authMode: 'public', requiredCapability: requiredCapability || 'public' };
  }
  if (
    /^\/v1(?:beta)?\//.test(route) &&
    (principals.includes('workspace_api_key') || principals.includes('console_key_selection'))
  ) {
    return { authMode: 'workspace-key', requiredCapability: requiredCapability || 'inference' };
  }
  if (principals.includes('operator_session')) {
    return { authMode: 'session', requiredCapability: requiredCapability || 'read' };
  }
  return { authMode: 'manual', requiredCapability: requiredCapability || 'restricted' };
}

function tagToGroupMap(doc: OpenApiDocument): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of doc['x-tagGroups'] ?? []) {
    for (const tag of group.tags ?? []) {
      map.set(tag, group.name);
    }
  }
  return map;
}

export function extractOperationDescriptor(
  doc: OpenApiDocument,
  rawMethod: string,
  route: string,
  tagGroupLookup?: Map<string, string>,
): OperationDescriptor | null {
  const lowerMethod = rawMethod.toLowerCase();
  if (!HTTP_METHODS.has(lowerMethod)) return null;
  const pathItem = doc.paths?.[route];
  if (!pathItem || typeof pathItem !== 'object') return null;
  const operation = deref(doc, pathItem[lowerMethod]);
  if (!operation) return null;

  const method = lowerMethod.toUpperCase() as HttpMethod;
  const operationId = typeof operation.operationId === 'string' ? operation.operationId : '';
  const slug = operationSlug(lowerMethod, route, operationId);
  const summary =
    typeof operation.summary === 'string' && operation.summary.trim()
      ? operation.summary.trim()
      : `${method} ${route}`;
  const description = typeof operation.description === 'string' ? operation.description.trim() : '';
  const tags = Array.isArray(operation.tags) ? operation.tags.map(String) : [];
  const tag = tags[0] || 'General';
  const groupLookup = tagGroupLookup ?? tagToGroupMap(doc);
  const tagGroup = groupLookup.get(tag) || 'Other';

  const rawParams = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];
  const deduped = new Map<string, OperationParameter>();
  for (const rawParam of rawParams) {
    const param = deref(doc, rawParam);
    if (!param) continue;
    const loc = param.in;
    if (loc !== 'path' && loc !== 'query' && loc !== 'header') continue;
    const name = typeof param.name === 'string' ? param.name : '';
    if (!name) continue;
    const schema = deref(doc, param.schema);
    const enumValues = Array.isArray(schema?.enum)
      ? schema.enum.filter((v) => v !== null && v !== undefined).map(String)
      : undefined;
    const rawType = schema?.type;
    const type = Array.isArray(rawType)
      ? String(rawType.find((t) => t !== 'null') ?? 'string')
      : typeof rawType === 'string'
        ? rawType
        : 'string';
    const defaultValue =
      schema?.default !== undefined && schema.default !== null
        ? String(schema.default)
        : '';
    const key = `${loc}:${loc === 'header' ? name.toLowerCase() : name}`;
    deduped.set(key, {
      name,
      in: loc,
      required: loc === 'path' ? true : Boolean(param.required),
      description: typeof param.description === 'string' ? param.description.trim() : '',
      defaultValue,
      enumValues: enumValues && enumValues.length > 0 ? enumValues : undefined,
      type,
    });
  }

  const requestBody = deref(doc, operation.requestBody);
  const content =
    requestBody?.content && typeof requestBody.content === 'object'
      ? (requestBody.content as Record<string, unknown>)
      : null;
  const mediaTypes = content ? Object.keys(content) : [];
  const jsonMediaType = mediaTypes.find((mt) => mt.includes('json')) ?? null;
  const mediaType = jsonMediaType ?? mediaTypes[0] ?? null;
  const isBinaryBody = Boolean(
    mediaType &&
      !mediaType.includes('json') &&
      !mediaType.startsWith('text/'),
  );
  const bodyEntry = mediaType && content ? deref(doc, content[mediaType]) : undefined;
  let defaultBody = '';
  if (mediaType && !isBinaryBody) {
    if (bodyEntry?.example !== undefined) {
      defaultBody =
        typeof bodyEntry.example === 'string'
          ? bodyEntry.example
          : JSON.stringify(bodyEntry.example, null, 2);
    } else {
      defaultBody = starterJsonBody(route, method, bodyEntry?.schema, doc);
    }
  }

  const responses: OperationResponseSummary[] = [];
  if (operation.responses && typeof operation.responses === 'object') {
    for (const [status, rawResp] of Object.entries(operation.responses as Record<string, unknown>)) {
      const resp = deref(doc, rawResp);
      responses.push({
        status,
        description: typeof resp?.description === 'string' ? resp.description.trim() : '',
      });
    }
  }

  const { authMode, requiredCapability } = deriveAuthMode(route, operation, doc);

  return {
    slug,
    method,
    route,
    operationId: operationId || slug,
    summary,
    description,
    tag,
    tagGroup,
    authMode,
    requiredCapability,
    mutating: !['GET', 'HEAD', 'OPTIONS'].includes(method),
    supportsModelPicker: MODEL_PICKER_ROUTES.has(route),
    parameters: [...deduped.values()],
    mediaType,
    isBinaryBody,
    bodyRequired: Boolean(requestBody?.required),
    defaultBody,
    responses,
  };
}

export function indexPublicOperations(doc: OpenApiDocument): {
  operations: OperationDescriptor[];
  bySlug: Map<string, OperationDescriptor>;
  groups: OperationGroup[];
} {
  const groupLookup = tagToGroupMap(doc);
  const operations: OperationDescriptor[] = [];
  const bySlug = new Map<string, OperationDescriptor>();

  for (const [route, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem)) {
      const descriptor = extractOperationDescriptor(doc, method, route, groupLookup);
      if (!descriptor) continue;
      operations.push(descriptor);
      bySlug.set(descriptor.slug, descriptor);
    }
  }

  const groupOrder = (doc['x-tagGroups'] ?? []).map((g) => g.name);
  const grouped = new Map<string, OperationDescriptor[]>();
  for (const op of operations) {
    const list = grouped.get(op.tagGroup) ?? [];
    list.push(op);
    grouped.set(op.tagGroup, list);
  }

  const orderedGroupNames = [
    ...groupOrder.filter((name) => grouped.has(name)),
    ...[...grouped.keys()].filter((name) => !groupOrder.includes(name)),
  ];

  const groups: OperationGroup[] = orderedGroupNames.map((name) => ({
    name,
    operations: (grouped.get(name) ?? []).sort(
      (a, b) => a.route.localeCompare(b.route) || a.method.localeCompare(b.method),
    ),
  }));

  return { operations, bySlug, groups };
}

export function resolveRequestUrl(
  route: string,
  origin: string,
  pathValues: Record<string, string>,
  queryValues: Record<string, string>,
): { url: string; missingPathParams: string[] } {
  const missingPathParams: string[] = [];
  const resolvedPath = route.replace(/\{([^}]+)\}/g, (_, rawName: string) => {
    const val = (pathValues[rawName] ?? '').trim();
    if (!val) {
      missingPathParams.push(rawName);
      return `{${rawName}}`;
    }
    // Gemini `{model_action}` uses `model:generateContent` where `:` is part of the action suffix.
    if (rawName === 'model_action') {
      return val.split('/').map(encodeURIComponent).join('/');
    }
    return encodeURIComponent(val);
  });

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(queryValues)) {
    if (v.trim() !== '') search.set(k, v.trim());
  }
  const qs = search.toString();
  const base = origin.replace(/\/+$/, '');
  return {
    url: `${base}${resolvedPath}${qs ? `?${qs}` : ''}`,
    missingPathParams,
  };
}

function shellEscapeSingle(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function buildCurlCommand(
  operation: OperationDescriptor,
  origin: string,
  pathValues: Record<string, string>,
  queryValues: Record<string, string>,
  headerValues: Record<string, string>,
  bodyText: string,
): string {
  const { url } = resolveRequestUrl(operation.route, origin || '$NIU_ORIGIN', pathValues, queryValues);
  const lines = [`curl --fail-with-body -X ${operation.method} '${shellEscapeSingle(url)}'`];

  if (operation.authMode === 'workspace-key') {
    lines.push('  -H "Authorization: Bearer $NIU_API_KEY"');
  } else if (operation.authMode === 'session') {
    lines.push('  -H "Cookie: __Host-niu_session=$NIU_SESSION"');
  }

  for (const param of operation.parameters) {
    if (param.in !== 'header') continue;
    const val = (headerValues[param.name] ?? '').trim();
    if (val) {
      lines.push(`  -H '${shellEscapeSingle(`${param.name}: ${val}`)}'`);
    }
  }

  if (operation.mediaType && operation.mutating) {
    lines.push(`  -H 'Content-Type: ${shellEscapeSingle(operation.mediaType)}'`);
    if (operation.isBinaryBody) {
      lines.push('  --data-binary @payload.bin');
    } else if (bodyText.trim()) {
      lines.push(`  --data '${shellEscapeSingle(bodyText.trim())}'`);
    }
  }

  return lines.join(' \\\n');
}
