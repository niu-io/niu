import {
  IconChartLine,
  IconHistory,
  IconPlugConnected,
  IconSettings,
  IconTag,
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
  icon?: TablerIcon;
  items: AdminNavItem[];
};

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'core',
    items: [
      { to: '/admin/providers', labelEn: 'Providers', labelZh: '模型供应商', icon: IconPlugConnected },
      { to: '/admin/pricing', labelEn: 'Standard pricing', labelZh: '标准售价', icon: IconTag, resaleOnly: true },
      {
        to: '/admin/customers',
        labelEn: 'Customers',
        labelZh: '客户管理',
        icon: IconUsers,
        resaleOnly: true,
        badgeKey: 'pendingRegistrations',
      },
      { to: '/admin/reports', labelEn: 'Reports', labelZh: '财务与用量', icon: IconChartLine, resaleOnly: true },
      { to: '/admin/audit', labelEn: 'Audit logs', labelZh: '审计日志', icon: IconHistory },
      { to: '/admin/settings', labelEn: 'Settings', labelZh: '平台设置', icon: IconSettings },
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
  if (item.to === '/admin/customers') {
    return (
      clean === '/admin/customers' ||
      clean.startsWith('/admin/customers/') ||
      clean === '/admin/registrations' ||
      clean.startsWith('/admin/registrations/')
    );
  }
  if (item.to === '/admin/settings') {
    return (
      clean === '/admin/settings' ||
      clean.startsWith('/admin/settings/') ||
      clean === '/admin/branding' ||
      clean.startsWith('/admin/branding/') ||
      clean === '/admin/payments' ||
      clean.startsWith('/admin/payments/')
    );
  }
  return clean === item.to || clean.startsWith(`${item.to}/`);
}

export function isAdminNavGroupActive(group: AdminNavGroup, pathname: string): boolean {
  return group.items.some(item => isAdminNavItemActive(item, pathname));
}
