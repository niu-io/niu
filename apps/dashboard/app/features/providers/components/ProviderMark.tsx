import { useEffect, useState } from 'react';
import { IconPlugConnected } from '@tabler/icons-react';
import type { ProviderPreset } from '../provider-presets';
import { providerLogoSource, providerLogoIsMonochrome } from '../provider-logos';

export default function ProviderMark({ url = '', preset }: { url?: string; preset?: ProviderPreset }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const source = url ? (/^https?:\/\//i.test(url) ? providerLogoSource(url) : undefined) : preset?.logo;
  return <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-hidden="true">
    {source && !broken
      ? <img src={source} alt="" className={`size-6 object-contain${(url ? providerLogoIsMonochrome(url) : preset?.monochrome) ? ' dark:invert' : ''}`} referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      : <IconPlugConnected className="size-5 text-muted-foreground" />}
  </span>;
}
