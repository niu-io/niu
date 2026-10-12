export type VideoReportedQuantity = { state: 'missing' | 'invalid' } | { state: 'reported'; value: string };
export type VideoProviderTimes = { state: 'missing' | 'invalid' } | { state: 'reported'; created_at: string; updated_at: string };
export type VideoQueryObservation = {
  /** Internal continuation reference; never a product label. */
  cursor: string;
  observed_at_ms: number;
  meter: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'unknown';
  quantity: VideoReportedQuantity;
  /** Reported epoch seconds; independent of measured transport spans. */
  provider_times: VideoProviderTimes;
};
export type VideoQueryObservationPage = { data: VideoQueryObservation[]; next_cursor: string | null };
export type VideoQueryObservationQuery = { after?: string; limit?: number };
export function videoObservationQuery(query: VideoQueryObservationQuery = {}): string {
  const parameters = new URLSearchParams();
  if (query.limit !== undefined) {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new TypeError('Observation page size must be an integer from 1 to 100');
    parameters.set('limit', String(query.limit));
  }
  if (query.after !== undefined) {
    if (!/^[a-f0-9]{64}$/i.test(query.after)) throw new TypeError('A saved video observation cursor is required');
    parameters.set('after', query.after);
  }
  return parameters.size ? `?${parameters}` : '';
}
