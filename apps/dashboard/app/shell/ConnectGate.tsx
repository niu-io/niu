import type { ReactNode } from 'react';
import type { DashboardContext } from './dashboard-context';
import { useDashboardContext } from './dashboard-context';
import ConnectPrompt from '@/components/ConnectPrompt';

export default function ConnectGate({ children }: {
  children: (context: DashboardContext) => ReactNode;
}) {
  const context = useDashboardContext();
  if (context.token) return children(context);
  return <section className="panel">
    <ConnectPrompt />
  </section>;
}
