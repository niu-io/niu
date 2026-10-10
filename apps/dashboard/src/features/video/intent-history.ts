import { NiuAPIError, type RequestOptions, type VideoJobHistoryQuery } from '../../../../../sdks/javascript/src/index';
import type { NiuAdminClient, TenantScope, VideoIntentIndexEntry, VideoSubmissionIntent } from '../../../../../sdks/javascript/src/admin';

export type VideoIntentHistoryRow = VideoIntentIndexEntry & {
  scope: TenantScope;
  title: string;
  jobId?: string;
  keyId?: string;
};
export function videoSessionTitle(data: Pick<VideoSubmissionIntent, 'request' | 'model'>): string {
  const prompt=data.request?.content.map(item=>item.text).join('\n').split('\n').find(line=>line.trim())?.trim();
  return prompt ? `Video · ${prompt.slice(0,120)}` : data.model ? `Video · ${data.model}` : 'Video session';
}
type HistoryClient = Pick<NiuAdminClient, 'listVideoIntents' | 'getVideoIntent'>;

/** Read-only discovery. Restricted retained content does not hide erasable metadata. */
export async function videoIntentHistory(client: HistoryClient, scope: TenantScope, query: VideoJobHistoryQuery = {}, options: RequestOptions = {}) {
  const page = await client.listVideoIntents(scope, query, options);
  options.signal?.throwIfAborted();
  const entries = page.data.filter(entry => entry.content_state !== 'deleted');
  const rows: VideoIntentHistoryRow[] = new Array(entries.length);
  let next = 0;
  let incomplete = false;
  // Bound content reads; index ordering remains intact regardless of completion order.
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (next < entries.length) {
      options.signal?.throwIfAborted();
      const position = next++;
      const entry = entries[position];
      const expiry=new Date(Number(entry.expires_at_ms));
      const expiryLabel=Number.isFinite(expiry.getTime()) ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(expiry):'';
      const row: VideoIntentHistoryRow = {
        ...entry, scope, title: entry.content_state === 'expired' ? `Expired video input${expiryLabel ? ` · ${expiryLabel}`:''}` : `Saved video request${expiryLabel ? ` · Expires ${expiryLabel}`:''}`,
      };
      try {
        const { data } = await client.getVideoIntent(scope, entry.id, options);
        options.signal?.throwIfAborted();
        row.title = data.request || data.model ? videoSessionTitle(data) : row.title;
        row.revision = data.revision;
        row.content_state = data.content_state;
        row.expires_at_ms = data.expires_at_ms;
        row.jobId = data.job?.id;
        row.keyId = data.key_id;
      } catch (error) {
        options.signal?.throwIfAborted();
        if (!(error instanceof NiuAPIError && [403, 404].includes(error.status))) incomplete = true;
      }
      rows[position] = row;
    }
  }));
  options.signal?.throwIfAborted();
  return { data: rows.filter(row => row.content_state !== 'deleted'), has_more: page.has_more, next_before: page.next_before, incomplete };
}
