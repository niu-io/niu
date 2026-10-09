import { IconSettings, IconShieldLock } from "@tabler/icons-react";
import { IconBuildings as Building2 } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconChartLine as ChartNoAxesCombined } from "@tabler/icons-react";
import { IconCreditCard as CreditCard } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconLayoutDashboard as LayoutDashboard } from "@tabler/icons-react";
import { IconList as Logs } from "@tabler/icons-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconUsers as UsersRound } from "@tabler/icons-react";
import { IconPlugConnected as SupplierConnection } from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

export type Destination = 'Organization' | 'Global' | 'Workspace' | 'Models' | 'Administration' | 'Suppliers' | 'Settings';

export const navigation: Array<{ to: string; label: string; icon: TablerIcon; destination: Destination }> = [
  { destination: 'Settings', to: '/settings', label: 'Settings', icon: IconSettings },
  { destination: 'Organization', to: 'organization', label: 'Organization settings', icon: Building2 },
  { destination: 'Global', to: '/activity', label: 'Activity', icon: ChartNoAxesCombined },
  { destination: 'Global', to: '/generations', label: 'Generations', icon: IconSparkles },
  { destination: 'Workspace', to: '.', label: 'Overview', icon: LayoutDashboard },
  { destination: 'Workspace', to: 'keys', label: 'API keys', icon: KeyRound },
  { destination: 'Workspace', to: 'executions', label: 'Logs', icon: Logs },
  { destination: 'Models', to: '/models', label: 'Models', icon: Boxes },
  { destination: 'Workspace', to: 'guardrails', label: 'Guardrails', icon: ShieldCheck },
  { destination: 'Workspace', to: 'usage', label: 'Activity', icon: ChartNoAxesCombined },
  { destination: 'Workspace', to: 'billing', label: 'Billing', icon: CreditCard },
  { destination: 'Administration', to: '/admin', label: 'Admin', icon: IconShieldLock },
  { destination: 'Suppliers', to: '/suppliers', label: 'Suppliers', icon: SupplierConnection },
  { destination: 'Workspace', to: 'users', label: 'Users', icon: UsersRound },
  { destination: 'Workspace', to: 'settings', label: 'Settings', icon: IconSettings },
];
