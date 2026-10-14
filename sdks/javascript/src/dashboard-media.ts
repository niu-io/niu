import { createMediaAssetsClient, type MediaAssetMutationOptions, type MediaAssetSender } from './media-assets.js';

/** Session-authenticated workspace media, with an explicitly selected key/account context. */
export type DashboardMediaSender = MediaAssetSender;
export type DashboardMediaClient = ReturnType<typeof createDashboardMediaClient>;

function reference(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new TypeError('A canonical Niu workspace or key reference is required');
  }
  return value;
}

/**
 * Reuse the public media domain client under the dashboard session bridge.
 * Credentials stay server-side; this factory does not probe other accounts,
 * infer model support, retry mutations, or start verification on read.
 */
export function createDashboardMediaClient(
  send: DashboardMediaSender,
  organization: string,
  workspace: string,
  key: string,
) {
  reference(organization);
  reference(workspace);
  reference(key);
  return createMediaAssetsClient(<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: unknown, options?: MediaAssetMutationOptions): Promise<T> => {
    // Accept only the media domain prefix, never strip arbitrary versions or
    // forward an absolute URL into the administrator-authenticated sender.
    const relative = path.startsWith('/v1/media/') || path.startsWith('/v1/media?') || path === '/v1/media'
      ? path.slice('/v1'.length) : path;
    if (!relative.startsWith('/media/') && !relative.startsWith('/media?') && relative !== '/media') {
      throw new TypeError('Dashboard media operations must stay within the media domain');
    }
    if (options?.idempotencyKey !== undefined) {
      reference(options.idempotencyKey);
      if (options.idempotencyKey === '00000000-0000-0000-0000-000000000000') {
        throw new TypeError('Media idempotencyKey must be a canonical nonnil UUID');
      }
    }
    return send<T>(relative, method, body, options);
  });
}
