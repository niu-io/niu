import type { ReactNode } from 'react';
import type { ConsoleContext } from './console-context';
import { useConsoleContext } from './console-context';
import ConnectPrompt from '@/components/ConnectPrompt';
import PageHeader from '@/components/PageHeader';

export default function ConnectGate({ title, subtitle, children }: {
  title: string;
  subtitle: string;
  children: (context: ConsoleContext) => ReactNode;
}) {
  const context = useConsoleContext();
  if (context.token) return children(context);
  return <>
    <PageHeader title={title} subtitle={subtitle} />
    <section className="panel">
      <ConnectPrompt draft={context.draftToken} error={context.error} onChange={context.setDraftToken} onSubmit={context.connect} />
    </section>
  </>;
}
