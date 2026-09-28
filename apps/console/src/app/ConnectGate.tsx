import type { ReactNode } from 'react';
import type { ConsoleContext } from './console-context';
import { useConsoleContext } from './console-context';
import ConnectPrompt from '@/components/ConnectPrompt';

export default function ConnectGate({ children }: {
  children: (context: ConsoleContext) => ReactNode;
}) {
  const context = useConsoleContext();
  if (context.token) return children(context);
  return <section className="panel">
    <ConnectPrompt draft={context.draftToken} error={context.error} onChange={context.setDraftToken} onSubmit={context.connect} />
  </section>;
}
