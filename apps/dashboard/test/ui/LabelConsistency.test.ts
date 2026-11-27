import { describe, expect, it } from 'vitest';
import settingsNavigation from '@/features/account/settings-navigation.tsx?raw';
import settingsShell from '@/features/account/settings-shell.tsx?raw';
import accountProfile from '@/features/account/AccountProfile.tsx?raw';
import passwordSettings from '@/features/account/PasswordSettings.tsx?raw';
import organizationSettings from '@/features/organization/settings-section.tsx?raw';
import localeMessages from '@/shell/locale-messages.ts?raw';
import modelTable from '@/features/models/components/ModelTable.tsx?raw';
import settingsDialog from '@/features/account/settings-dialog.tsx?raw';
import operatorsView from '@/features/operators/components/OperatorsView.tsx?raw';
import operatorDirectory from '@/features/operators/components/OperatorDirectory.tsx?raw';
import keysView from '@/features/keys/components/KeysView.tsx?raw';
import accountBilling from '@/features/billing/AccountBilling.tsx?raw';
import overviewQuickStart from '@/features/overview/components/OverviewQuickStart.tsx?raw';

describe('Concise Chinese product labels', () => {
  it('uses short nouns in Settings navigation', () => {
    expect(settingsNavigation).toContain("t('Appearance', '外观')");
    expect(settingsNavigation).toContain("t('Members', '成员')");
    expect(settingsNavigation).toContain("t('Credits', '额度')");
    expect(settingsNavigation).toContain("t('About Niu', '关于')");
    for (const verbose of ['外观与语言', '成员管理', '额度与充值', '关于牛元']) {
      expect(settingsNavigation).not.toContain(verbose);
    }
  });

  it('keeps account and password actions to short verbs', () => {
    expect(accountProfile).toContain("t('Change photo', '更换')");
    expect(accountProfile).toContain("t('Display name', '名称')");
    expect(accountProfile).toContain("t('Save changes', '保存')");
    expect(passwordSettings).toContain("t('Update password', '更新')");
    expect(passwordSettings).toContain("t('Confirm new password', '确认密码')");
    expect(passwordSettings).not.toContain("t('Change password', '修改密码')}</Button>");
  });

  it('keeps appearance, billing, and About labels short', () => {
    expect(settingsShell).toContain("t('Language', '语言')");
    expect(settingsShell).toContain("t('Release notes', '发布说明')");
    expect(settingsShell).toContain("t('Report an issue', '反馈')");
    expect(settingsShell).not.toContain('额度与充值');
    expect(settingsShell).not.toContain('版本发布说明');
    expect(settingsShell).not.toContain('反馈问题');
  });

  it('uses short organization labels', () => {
    expect(organizationSettings).toContain("t('General', '常规')");
    expect(organizationSettings).toContain("t('Join with token', '令牌加入')");
    expect(organizationSettings).toContain("t('Member access token', '访问令牌')");
    expect(organizationSettings).not.toContain('加入已有组织');
    expect(organizationSettings).not.toContain('使用令牌加入');
  });

  it('keeps explanatory billing labels complete', () => {
    expect(accountBilling).toContain('可用余额');
    expect(accountBilling).toContain('账面余额');
    expect(accountBilling).toContain('请求预留');
    expect(accountBilling).toContain('已关闭');
  });

  it('keeps the redesigned Settings frame stable and grouped', () => {
    expect(settingsDialog).toContain('h-[min(760px,calc(100dvh-2rem))]');
    expect(settingsDialog).toContain('settings-content-actions');
    expect(settingsDialog).toContain('<DialogHeader className="sr-only">');
    expect(settingsDialog).not.toContain('settings-content-toolbar');
    expect(settingsDialog).not.toContain('settings-content-lead');
    expect(settingsDialog).toContain('<h2 className="sr-only">{selected?.label}</h2>');
    expect(settingsDialog).not.toContain('<h2 className="text-lg font-semibold">');
    expect(settingsShell).toContain('settings-section');
    expect(settingsShell).toContain('settings-about-summary');
    expect(settingsShell).toContain('settings-about-hero');
    expect(settingsShell).toContain('settings-about-resources');
    expect(settingsShell).not.toContain('settings-about-facts');
    expect(settingsShell).toContain('settings-about-legal');
    expect(settingsShell.match(/许可证/g)?.length).toBe(1);
  });

  it('keeps member search and the model trial action in their intended toolbars', () => {
    expect(operatorsView).toContain('Search members');
    expect(operatorsView).toContain('memberSearch');
    expect(operatorDirectory).not.toContain('PopoverTrigger');
    expect(modelTable).toContain('models-card-try');
    expect(modelTable).not.toContain('ArrowUpRight');
    expect(modelTable).not.toContain('ArrowRight');
    expect(modelTable).not.toContain('variant="link" className="h-auto p-0 text-xs');
  });

  it('keeps arrows out of button labels', () => {
    expect(settingsShell).not.toContain('IconExternalLink');
    expect(overviewQuickStart).not.toContain('IconArrowUpRight');
    expect(overviewQuickStart).not.toContain('IconArrowRight');
  });

  it('keeps the key directory as a readable list without a fixed table', () => {
    expect(keysView).toContain('<ul className="key-rows">');
    expect(keysView).toContain('className="key-row-facts"');
    expect(keysView).not.toContain('key-table');
  });

  it('renders the model trial action as 试用', () => {
    expect(localeMessages).toContain('"Try": "试用"');
    expect(localeMessages).toContain('"Try chat": "试用对话"');
    expect(localeMessages).toContain('"Try video": "试用视频"');
    expect(localeMessages).toContain('"Open Generations": "打开生成"');
    expect(localeMessages).not.toContain('打开多模态生成');
    expect(modelTable).toContain('uiT("Try chat")');
    expect(modelTable).toContain('uiT("Try video")');
    expect(modelTable).not.toContain('uiT("Open Generations")');
    expect(modelTable).not.toContain('uiT("Try in Chat")');
    expect(keysView).toContain('uiT("Open Generations", "试用")');
  });
});
