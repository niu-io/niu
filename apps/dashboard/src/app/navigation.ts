import { IconPhoto, IconVideo, IconSettings, IconShieldLock } from "@tabler/icons-react";
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
import { IconPlugConnected as ProviderConnection } from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

export type Destination = 'Organization' | 'Global' | 'Workspace' | 'Models' | 'Administration' | 'Providers' | 'Settings';

export const navigation: Array<{ to: string; label: string; labelZh: string; icon: TablerIcon; destination: Destination }> = [
  { destination: 'Settings', to: '/settings', label: 'Settings', labelZh: '设置', icon: IconSettings },
  { destination: 'Organization', to: 'organization', label: 'Organization settings', labelZh: '组织设置', icon: Building2 },
  { destination: 'Global', to: '/activity', label: 'Activity', labelZh: '活动', icon: ChartNoAxesCombined },
  { destination: 'Global', to: '/generations', label: 'Generations', labelZh: '生成对话', icon: IconSparkles },
  { destination: 'Workspace', to: '.', label: 'Overview', labelZh: '概览', icon: LayoutDashboard },
  { destination: 'Workspace', to: 'keys', label: 'API keys', labelZh: 'API 密钥', icon: KeyRound },
  { destination: 'Workspace', to: 'executions', label: 'Logs', labelZh: '请求日志', icon: Logs },
  { destination: 'Models', to: '/models', label: 'Models', labelZh: '模型', icon: Boxes },
  { destination: 'Workspace', to: 'library', label: 'Library', labelZh: '素材库', icon: IconPhoto },
  { destination: 'Workspace', to: 'video', label: 'Video setup', labelZh: '视频设置', icon: IconVideo },
  { destination: 'Workspace', to: 'guardrails', label: 'Guardrails', labelZh: '安全护栏', icon: ShieldCheck },
  { destination: 'Workspace', to: 'usage', label: 'Activity', labelZh: '活动', icon: ChartNoAxesCombined },
  { destination: 'Workspace', to: 'billing', label: 'Billing', labelZh: '计费', icon: CreditCard },
  { destination: 'Administration', to: '/admin', label: 'Admin', labelZh: '管理后台', icon: IconShieldLock },
  { destination: 'Providers', to: '/providers', label: 'Providers', labelZh: '模型供应商', icon: ProviderConnection },
  { destination: 'Workspace', to: 'users', label: 'Users', labelZh: '成员', icon: UsersRound },
  { destination: 'Workspace', to: 'settings', label: 'Settings', labelZh: '设置', icon: IconSettings },
];
