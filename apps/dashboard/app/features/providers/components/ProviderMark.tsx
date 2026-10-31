import { useEffect, useState } from 'react';
import { IconPlugConnected } from '@tabler/icons-react';
import { providerLogoSource, providerLogoIsMonochrome } from '../provider-logos';

export default function ProviderMark({ url = '' }: { url?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-hidden="true">
    {/^https?:\/\//i.test(url) && !broken
      ? <img src={providerLogoSource(url)} alt="" className={`size-6 object-contain${providerLogoIsMonochrome(url) ? ' dark:invert' : ''}`} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      : <IconPlugConnected className="size-5 text-muted-foreground" />}
  </span>;
}
