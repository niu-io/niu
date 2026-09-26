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

export const navigation: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '.', label: 'Overview', icon: LayoutDashboard },
  { to: 'models', label: 'Models', icon: Boxes },
  { to: 'vendors', label: 'Vendors', icon: Network },
  { to: 'keys', label: 'API keys', icon: KeyRound },
  { to: 'operators', label: 'Operators', icon: UsersRound },
  { to: 'usage', label: 'Usage & cost', icon: ChartNoAxesCombined },
  { to: 'executions', label: 'Executions', icon: Activity },
  { to: 'benchmarks', label: 'Benchmarks', icon: FlaskConical },
  { to: 'subscriptions', label: 'Subscriptions', icon: WalletCards },
];
