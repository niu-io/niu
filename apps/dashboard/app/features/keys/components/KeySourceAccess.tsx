import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { ProjectKey } from '../api';

/** Read-only source policy. Editing lives in the single key settings surface. */
export default function KeySourceAccess({ projectKey }: { projectKey: ProjectKey }) {
  const { t: uiT, format: uiF } = useUILocale();
  const cidrs = projectKey.ip_policy ? projectKey.ip_policy.allowed_cidrs : projectKey.allowed_cidrs ?? null;
  return <Card>
    <CardHeader><CardTitle>{uiT("Source IP access")}</CardTitle><CardDescription>{uiT("Control which IP addresses can use this API key.")}</CardDescription></CardHeader>
    <CardContent>
      <p className="text-sm">{cidrs === null || cidrs === undefined ? uiT("Allow all sources") : cidrs.length ? uiF("{0} allowed network{1}", [cidrs.length, cidrs.length === 1 ? '' : 's']) : uiT("Block all sources")}</p>
      {cidrs?.length ? <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{cidrs.map(network => <li key={network} className="break-all font-mono">{network}</li>)}</ul> : null}
    </CardContent>
  </Card>;
}
