export type KeyReferenceOption = { id: string; name: string; slug?: string };
export type KeyFilterOption = KeyReferenceOption & { revoked: boolean; expired: boolean };

/** Public, readable references only; internal identifier-shaped slugs stay hidden. */
export function keyReference(slug?: string): string | null {
  return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}/i.test(slug) ? slug : null;
}

export function keyChoiceLabels(keys: readonly KeyReferenceOption[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key.name, (counts.get(key.name) ?? 0) + 1);
  const labels = new Map<string, { option: string; compact: string }>();
  for (const key of keys) {
    const reference = (counts.get(key.name) ?? 0) > 1 ? keyReference(key.slug) : null;
    labels.set(key.id, {
      option: reference ? `${key.name} · ${reference}` : key.name,
      compact: reference ?? key.name,
    });
  }
  return labels;
}
