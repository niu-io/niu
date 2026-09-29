import {
  ReceiptText,
  Building2,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  ScanSearch,
  Gauge,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type Destination = 'Organization' | 'Global' | 'Workspace' | 'Models' | 'Administration' | 'Providers';

export const navigation: Array<{ to: string; label: string; icon: LucideIcon; destination: Destination }> = [
  { destination: 'Organization', to: 'organization', label: 'Organization settings', icon: Building2 },
  { destination: 'Global', to: '/chat', label: 'Chat', icon: MessagesSquare },
  { destination: 'Workspace', to: '.', label: 'Overview', icon: LayoutDashboard },
  { destination: 'Workspace', to: 'keys', label: 'API keys', icon: KeyRound },
  { destination: 'Workspace', to: 'executions', label: 'Observability', icon: ScanSearch },
  { destination: 'Workspace', to: 'tasks', label: 'Tasks', icon: ListTodo },
  { destination: 'Workspace', to: 'benchmarks', label: 'Benchmarks', icon: Gauge },
  { destination: 'Models', to: 'models', label: 'Models', icon: Boxes },
  { destination: 'Workspace', to: 'billing', label: 'Billing', icon: ReceiptText },
  { destination: 'Workspace', to: 'usage', label: 'Usage', icon: ChartNoAxesCombined },
  { destination: 'Workspace', to: 'costs', label: 'Upstream costs', icon: CircleDollarSign },
  { destination: 'Workspace', to: 'operators', label: 'Access management', icon: UsersRound },
  { destination: 'Providers', to: '/providers', label: 'Providers', icon: Network },
  { destination: 'Administration', to: 'vendors', label: 'Upstream connections', icon: Network },
];
