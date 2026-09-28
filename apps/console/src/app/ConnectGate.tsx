import type { ReactNode } from 'react';
import type { ConsoleContext } from './console-context';
import { useConsoleContext } from './console-context';
import ConnectPrompt from '@/components/ConnectPrompt';
import PageHeader from '@/components/PageHeader';

export default function ConnectGate({ subtitle, children, action, className }: {
  subtitle: string;
  children: (context: ConsoleContext) => ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const context = useConsoleContext();
  if (context.token) return children(context);
  return <>
    <PageHeader subtitle={subtitle} action={action} className={className} />
    <section className="panel">
      <ConnectPrompt draft={context.draftToken} error={context.error} onChange={context.setDraftToken} onSubmit={context.connect} />
    </section>
  </>;
}
