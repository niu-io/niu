/** Platform operations only; these records never contain settings or credentials. */
export type PlatformAuditCategory = 'authentication' | 'configuration' | 'access' | 'supplier';
export type PlatformAuditSource = 'operator' | 'vendor' | 'supplier' | 'branding' | 'payment_gateway' | 'platform_access' | 'retail_price' | 'retail_text_enrollment' | 'retail_media_enrollment' | 'gift_correction' | 'balance_grant' | 'credit_policy' | 'grant_preparation' | 'media_liability' | 'procurement_configuration';
export interface PlatformAuditEvent {
  /** Recorded transitions only; absent/null on older servers and other journal streams. */
  before_role?: 'owner' | 'admin' | 'viewer' | null;
  after_role?: 'owner' | 'admin' | 'viewer' | null;
  /** Internal source-qualified reference; do not render this as a display label. */
  id: string;
  source: PlatformAuditSource;
  category: PlatformAuditCategory;
  action: string;
  actor_kind: string;
  /** Current linked actor name, recorded system role, or an explicit unknown label. */
  actor_label: string;
  target_label: string;
  revision: string | null;
  created_at: string;
}
export interface PlatformAuditPage {
  data: PlatformAuditEvent[];
  next_cursor: string | null;
}
export interface PlatformAuditQuery {
  /** Defaults to 50; allowed range is 1 through 100. */
  limit?: number;
  /** Opaque source-qualified reference returned by the previous page. */
  cursor?: string;
  category?: PlatformAuditCategory;
}

/** Construct a bounded read query without treating a cursor as a display label. */
export function platformAuditQuery(query: PlatformAuditQuery): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Audit limit must be between 1 and 100');
    params.set('limit', String(query.limit));
  }
  if (query.category !== undefined) {
    if (!['authentication', 'configuration', 'access', 'supplier'].includes(query.category)) throw new TypeError('Unsupported audit category');
    params.set('category', query.category);
  }
  if (query.cursor !== undefined) {
    if (!query.cursor || query.cursor.length > 100) throw new TypeError('Invalid audit cursor');
    params.set('cursor', query.cursor);
  }
  return params.size ? '?' + params : '';
}
