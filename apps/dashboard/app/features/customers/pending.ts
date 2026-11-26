/** Disposable retry cache; saved companies/users/workspaces remain backend-owned. */
export type PendingCreation = {
  key: string;
  name: string;
  slug?: string;
  accountKind?: 'personal' | 'organization';
};

export function readPending(scope: string): PendingCreation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('niu:customer-setup:' + scope) ?? 'null');
    const validKind =
      value?.accountKind === undefined ||
      value?.accountKind === 'personal' ||
      value?.accountKind === 'organization';
    return value &&
      typeof value.key === 'string' &&
      /^[a-f0-9-]{36}$/.test(value.key) &&
      typeof value.name === 'string' &&
      value.name.length <= 200 &&
      (value.slug === undefined || typeof value.slug === 'string') &&
      validKind
      ? value
      : null;
  } catch {
    return null;
  }
}

export function savePending(scope: string, value: PendingCreation) {
  // Refuse dispatch when the retry cache cannot be saved. No password or token is cached.
  sessionStorage.setItem('niu:customer-setup:' + scope, JSON.stringify(value));
}

export function clearPending(scope: string) {
  try {
    sessionStorage.removeItem('niu:customer-setup:' + scope);
  } catch {
    /* Successful backend creation remains authoritative. */
  }
}
