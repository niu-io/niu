import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconChartLine,
  IconCreditCard,
  IconHistory,
  IconLayoutDashboard,
  IconPalette,
  IconPlugConnected,
  IconRoute,
  IconTag,
  IconUserCheck,
  IconUserShield,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react';

export type AdminNavItem = {
  to: string;
  labelEn: string;
  labelZh: string;
  icon: TablerIcon;
  end?: boolean;
  resaleOnly?: boolean;
  badgeKey?: 'pendingRegistrations';
};

export type AdminNavGroup = {
  id: string;
  labelEn?: string;
  labelZh?: string;
  items: AdminNavItem[];
};

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'overview',
    items: [
      { to: '/admin', labelEn: 'Overview', labelZh: '总览', icon: IconLayoutDashboard, end: true },
    ],
  },
  {
    id: 'supply',
    labelEn: 'Supply',
    labelZh: '供给',
    items: [
      { to: '/admin/providers', labelEn: 'Providers', labelZh: '模型供应商', icon: IconPlugConnected },
      { to: '/admin/routing', labelEn: 'Custom models', labelZh: '自定义模型', icon: IconRoute },
    ],
  },
  {
    id: 'commerce',
    labelEn: 'Commerce',
    labelZh: '商业',
    items: [
      { to: '/admin/pricing', labelEn: 'Pricing', labelZh: '客户定价', icon: IconTag, resaleOnly: true },
      { to: '/admin/customers', labelEn: 'Customers', labelZh: '客户管理', icon: IconUsers, resaleOnly: true },
      {
        to: '/admin/registrations',
        labelEn: 'Registrations',
        labelZh: '注册审批',
        icon: IconUserCheck,
        resaleOnly: true,
        badgeKey: 'pendingRegistrations',
      },
      { to: '/admin/payments', labelEn: 'Payments', labelZh: '收款配置', icon: IconCreditCard, resaleOnly: true },
    ],
  },
  {
    id: 'operations',
    labelEn: 'Operations',
    labelZh: '运营',
    items: [
      { to: '/admin/reports', labelEn: 'Financial reports', labelZh: '财务报表', icon: IconChartLine, resaleOnly: true },
      { to: '/admin/incidents', labelEn: 'Incidents', labelZh: '连接事故', icon: IconAlertTriangle },
      { to: '/admin/audit', labelEn: 'Audit logs', labelZh: '审计日志', icon: IconHistory },
    ],
  },
  {
    id: 'settings',
    labelEn: 'Settings',
    labelZh: '设置',
    items: [
      { to: '/admin/branding', labelEn: 'Branding', labelZh: '品牌定制', icon: IconPalette },
      { to: '/admin/settings/registration', labelEn: 'Registration policy', labelZh: '注册策略', icon: IconUserShield },
      { to: '/admin/settings', labelEn: 'General & billing', labelZh: '基础与计费', icon: IconAdjustmentsHorizontal, end: true },
    ],
  },
];

export function getAdminNavGroups(operatingMode?: string): AdminNavGroup[] {
  const isInternal = operatingMode === 'internal';
  return ADMIN_NAV_GROUPS.map(group => ({
    ...group,
    items: isInternal ? group.items.filter(item => !item.resaleOnly) : group.items,
  })).filter(group => group.items.length > 0);
}

export function isAdminNavItemActive(item: AdminNavItem, pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (item.end) {
    return clean === item.to;
  }
  if (item.to === '/admin/providers') {
    return (
      clean === '/admin/providers' ||
      clean.startsWith('/admin/providers/') ||
      clean === '/admin/suppliers' ||
      clean.startsWith('/admin/suppliers/')
    );
  }
  return clean === item.to || clean.startsWith(`${item.to}/`);
}
