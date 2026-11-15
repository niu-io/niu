import { useEffect, useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { Button } from '../../../dashboard/app/components/ui/button';

export function OriginPrompt({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const [origin, setOrigin] = useState<string>('{ORIGIN}');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const prompt =
    locale === 'zh'
      ? `请先阅读 ${origin}/llms.txt 并按照 ${origin}/docs/install.md 完成 /connect 设备授权接入，然后检查 /v1/key 与 /v1/models 确认实际授权范围与可用模型。`
      : `Read ${origin}/llms.txt and follow ${origin}/docs/install.md to connect to Niu via /connect, inspect /v1/key and /v1/models, and confirm granted permissions before acting.`;

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="my-4">
      <pre className="docs-home-setup-prompt !my-0">
        <code>{prompt}</code>
      </pre>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {locale === 'zh' ? (copied ? '已复制' : '复制提示词') : copied ? 'Copied' : 'Copy prompt'}
        </Button>
      </div>
    </div>
  );
}
