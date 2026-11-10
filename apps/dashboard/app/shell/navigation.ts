import { IconRoute, IconFlask, IconPhoto, IconVideo, IconSettings, IconShieldLock } from "@tabler/icons-react";
import { IconCpu as Boxes } from "@tabler/icons-react";
import { IconChartLine as ChartNoAxesCombined } from "@tabler/icons-react";
import { IconCreditCard as CreditCard } from "@tabler/icons-react";
import { IconKey as KeyRound } from "@tabler/icons-react";
import { IconLayoutDashboard as LayoutDashboard } from "@tabler/icons-react";
import { IconList as Logs } from "@tabler/icons-react";
import { IconSparkles } from "@tabler/icons-react";
import { IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { IconPlugConnected as ProviderConnection } from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

export type Destination = 'Global' | 'Workspace' | 'Models' | 'Administration' | 'Providers' | 'Settings';

export type NavItem = {
  to: string;
  label: string;
  labelZh: string;
  icon: TablerIcon;
  destination: Destination;
  hidden?: boolean;
  parentTo?: string;
};

export const navigation: Array<NavItem> = [
  { destination: 'Settings', to: '/settings', label: 'Settings', labelZh: '设置', icon: IconSettings },
  { destination: 'Global', to: '/activity', label: 'Activity', labelZh: '活动', icon: ChartNoAxesCombined },
  { destination: 'Global', to: '/generations', label: 'Generations', labelZh: '生成对话', icon: IconSparkles },
  { destination: 'Workspace', to: '.', label: 'Overview', labelZh: '概览', icon: LayoutDashboard },
  { destination: 'Workspace', to: 'keys', label: 'API keys', labelZh: 'API 密钥', icon: KeyRound },
  { destination: 'Workspace', to: 'executions', label: 'Logs', labelZh: '请求日志', icon: Logs },
  { destination: 'Workspace', to: 'assets', label: 'Assets', labelZh: '素材库', icon: IconPhoto },
  { destination: 'Models', to: '/models', label: 'Models', labelZh: '模型', icon: Boxes },
  { destination: 'Workspace', to: 'routing', label: 'Routing', labelZh: '模型路由', icon: IconRoute },
  { destination: 'Workspace', to: 'evaluations', label: 'Evaluations', labelZh: '评估', icon: IconFlask },
  { destination: 'Workspace', to: 'library', label: 'Library', labelZh: '素材库', icon: IconPhoto, hidden: true, parentTo: 'assets' },
  { destination: 'Workspace', to: 'video', label: 'Video setup', labelZh: '视频设置', icon: IconVideo, hidden: true, parentTo: 'assets' },
  { destination: 'Workspace', to: 'guardrails', label: 'Guardrails', labelZh: '安全护栏', icon: ShieldCheck },
  { destination: 'Workspace', to: 'usage', label: 'Activity', labelZh: '活动', icon: ChartNoAxesCombined, hidden: true, parentTo: '.' },
  { destination: 'Workspace', to: 'billing', label: 'Billing', labelZh: '计费', icon: CreditCard },
  { destination: 'Administration', to: '/admin', label: 'Admin', labelZh: '管理后台', icon: IconShieldLock },
  { destination: 'Providers', to: '/providers', label: 'Providers', labelZh: '模型供应商', icon: ProviderConnection },
  { destination: 'Workspace', to: 'settings', label: 'Settings', labelZh: '设置', icon: IconSettings },
];
