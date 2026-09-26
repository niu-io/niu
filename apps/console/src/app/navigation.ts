import {
  Activity,
  Boxes,
  ChartNoAxesCombined,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  Network,
  WalletCards,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type Destination = 'Workspace' | 'Models' | 'Benchmarks' | 'Administration';

export const navigation: Array<{ to: string; label: string; icon: LucideIcon; destination: Destination }> = [
  { destination: 'Workspace', to: '.', label: 'Overview', icon: LayoutDashboard },
  { destination: 'Workspace', to: 'executions', label: 'Tasks', icon: Activity },
  { destination: 'Benchmarks', to: 'benchmarks', label: 'Benchmarks', icon: FlaskConical },
  { destination: 'Workspace', to: 'usage', label: 'Usage & cost', icon: ChartNoAxesCombined },
  { destination: 'Models', to: 'models', label: 'Configured models', icon: Boxes },
  { destination: 'Workspace', to: 'subscriptions', label: 'Subscriptions', icon: WalletCards },
  { destination: 'Workspace', to: 'keys', label: 'API keys', icon: KeyRound },
  { destination: 'Workspace', to: 'operators', label: 'Operators', icon: UsersRound },
  { destination: 'Administration', to: 'vendors', label: 'Vendors', icon: Network },
];
