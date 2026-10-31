import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ListRowsSkeleton } from '@/components/PageSkeletons';
import { cachedGet, markCachedStale, peekCachedGet } from '@/features/providers/api';
import type { DetectorBinding } from './ExternalDetectors';

type Description = {
  detector: string; configuration_fingerprint: string; recipient: string;
  region: string; retention: string; policy_activation: boolean;
  content_sent: string; processing_guarantees: string; external_charge: string;
};

/** Resolve saved bindings without presenting a changed recipient as historical fact. */
export default function DetectorPreview({ token, endpoint, bindings }: {
  token: string; endpoint: string; bindings: DetectorBinding[];
}) {
  const detectorsPath = `${endpoint}/detectors`;
  const validPreview = (data: unknown): data is Description[] =>
    Array.isArray(data) && !data.some(item => !item ||
      ![item.detector, item.recipient, item.region, item.retention].every(value => typeof value === 'string' && value.trim()) ||
      !/^[a-f0-9]{64}$/.test(item.configuration_fingerprint) ||
      typeof item.policy_activation !== 'boolean');
  const [descriptions, setDescriptions] = useState<Description[] | null>(() => {
    const cached = peekCachedGet<{ data: Description[] }>(token, detectorsPath);
    return cached && validPreview(cached.data) ? cached.data : null;
  });
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const lastReload = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    if (force) setDescriptions(null);
    setError('');
    cachedGet<{data: Description[]}>(token, detectorsPath, { signal: controller.signal, force })
      .then(result => {
        if (controller.signal.aborted) return;
        if (!validPreview(result.data)) throw new Error('External check details could not be verified.');
        setDescriptions(result.data);
      }).catch(cause => {
        markCachedStale(token, detectorsPath);
        if (!controller.signal.aborted) {
          setDescriptions(null);
          setError(cause instanceof Error ? cause.message : 'External check details unavailable.');
        }
      });
    return () => controller.abort();
  }, [token, detectorsPath, reload]);
  return <div className="space-y-3">
    <p>Required checks inspect request text after local redaction. Matches and unavailable services block requests.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Retry check details</Button></AlertDescription></Alert>}
    {!descriptions && !error && <ListRowsSkeleton rows={2} label="Loading saved check details…" />}
    {descriptions && bindings.map((binding, index) => {
      const current = descriptions.find(item => item.detector === binding.detector);
      const matches = current?.configuration_fingerprint === binding.configuration_fingerprint;
      return <section key={`${binding.detector}:${index}`} className="space-y-2">
        <h4 className="font-medium">{matches ? current!.recipient : `Saved external check ${index + 1}`}</h4>
        {!current ? <p>Details unavailable. The saved recipient and processing conditions cannot be recovered from the current configuration. This check cannot currently be used.</p>
          : !matches ? <><p>Configuration changed. The saved recipient and processing conditions are unavailable; current details do not describe this saved version.</p><p>Current recipient: {current.recipient}. Review the current check in External input checks before using it.</p></>
          : <><p>{current.policy_activation ? 'Configuration matches this saved version. Availability is checked again when applied.' : 'Configuration matches this saved version, but this check is not currently enabled for this workspace.'}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt>Region</dt><dd className="break-words">{current.region}</dd>
              <dt>Retention</dt><dd className="break-words">{current.retention}</dd>
              <dt>Content sent</dt><dd>{current.content_sent === 'request_text_after_local_redaction' ? 'Request text after local redaction' : 'Processing details unavailable'}</dd>
              <dt>External fees</dt><dd>{current.external_charge === 'declared_unmetered' ? 'Declared unmetered' : 'Unknown'}</dd>
            </dl><p className="text-sm text-muted-foreground">Processing conditions are declared by the administrator and have not been independently verified.</p></>}
      </section>;
    })}
  </div>;
}
