const SECTION_ANCHORS: Record<string, string> = {
  access: 'access',
  input: 'input',
  output: 'output',
  detectors: 'detectors',
};

/** Build the canonical single-page Guardrails URL for an old section-style path. */
export function guardrailsLegacyTarget(
  pathname: string,
  search: string,
  hash: string,
  sectionPath: string | undefined,
): string {
  const base =
    pathname.match(/^(.*\/guardrails)(?:\/.*)?$/)?.[1] ??
    pathname.replace(/\/+$/, '');
  const parts = (sectionPath ?? '').split('/').filter(Boolean);
  const first = parts[0] ?? '';
  const anchor =
    first === 'policy' ? SECTION_ANCHORS[parts[1] ?? ''] : SECTION_ANCHORS[first];
  const tab =
    first === 'history' ? 'history' : first === 'denials' ? 'blocked' : 'policy';
  const query = new URLSearchParams();
  query.set('tab', tab);
  for (const [key, value] of new URLSearchParams(search)) {
    if (key !== 'tab') query.append(key, value);
  }
  return `${base}?${query.toString()}${anchor ? `#${anchor}` : hash}`;
}
