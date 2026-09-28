import { Boxes } from 'lucide-react';
import type { ProviderIdentity } from '@/lib/providers';

export default function ProviderLogo({ provider, size = 'default' }: { provider: ProviderIdentity; size?: 'small' | 'default' | 'large' }) {
  const colored = ['qwen', 'deepseek', 'google', 'meta', 'mistral', 'minimax', 'qiniu', 'cohere', 'nvidia', 'bytedance'].includes(provider.id);
  return <span className={`provider-logo provider-logo-${size}${colored ? ' provider-logo-colored' : ''}`} aria-hidden="true">
    {provider.logo && colored ? <img src={provider.logo} alt="" width="24" height="24" /> : provider.logo ? <span className="provider-logo-art" style={{ background: 'currentColor', mask: `url("${provider.logo}") center / contain no-repeat`, WebkitMask: `url("${provider.logo}") center / contain no-repeat` }} /> : <Boxes size={20} />}
  </span>;
}
