import type { PlatformConnectionIncident } from '@niu-io/sdk/admin';
import { request } from '@/lib/api-client';

export type IncidentPage = { data: PlatformConnectionIncident[]; next_before: string | null; coverage: { request_observed: true; proactive_probe: 'not_configured' } };

export async function loadIncidents(token: string, status: 'active' | 'resolved', signal: AbortSignal, before?: string): Promise<IncidentPage> {
  const query = new URLSearchParams({ status });
  if (before) query.set('before', before);
  const page = await request<IncidentPage>(token, `/api/v1/incidents?${query}`, 'GET', undefined, signal);
  const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (!Array.isArray(page?.data) || page.data.some(item =>
    !item || !/^incident-[1-9][0-9]*$/.test(item.reference)
    || typeof item.connection_name !== 'string' || !item.connection_name.trim()
    || typeof item.model !== 'string' || !item.model.trim()
    || !['account_restricted', 'authentication_rejected', 'repeated_upstream_failures'].includes(item.cause)
    || item.status !== status || !date(item.first_observed_at) || !date(item.last_observed_at)
    || !/^[1-9][0-9]*$/.test(item.observations)
    || (item.status === 'active' ? item.recovered_at !== null : !date(item.recovered_at))
    || (item.provider !== null && (!item.provider || typeof item.provider.name !== 'string'
      || typeof item.provider.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.provider.slug)))
    || !item.notifications || !['delivered', 'incomplete', 'failed', 'sending', 'queued', 'no_recipients'].includes(item.notifications.state)
    || !['workspaces', 'delivered', 'failed', 'cancelled', 'queued', 'sending', 'not_configured', 'authority_inactive'].every(key => typeof (item.notifications as unknown as Record<string, unknown>)[key] === 'number' && Number.isInteger((item.notifications as unknown as Record<string, unknown>)[key]) && ((item.notifications as unknown as Record<string, unknown>)[key] as number) >= 0))
    || (page.next_before !== null && !/^incident-[1-9][0-9]*$/.test(page.next_before))
    || !page.coverage || page.coverage.request_observed !== true || page.coverage.proactive_probe !== 'not_configured') {
    throw new Error('Connection incident evidence could not be read.');
  }
  return page;
}
