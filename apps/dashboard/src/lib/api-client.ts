export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function request<T>(
  token: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiRequestError(payload?.error?.message ?? 'Request failed (' + response.status + ')', response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}
