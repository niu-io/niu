import { useEffect, useRef, useState } from 'react';
import { IconDeviceDesktop, IconLanguage, IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../../dashboard/src/components/ui/dropdown-menu';
import { applyTheme, readTheme, saveTheme, subscribeTheme, type Theme } from '../../../dashboard/src/app/theme';
import { useLocale, type Locale } from '../../../dashboard/src/app/locale';

export default function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>('system');
  const { locale, setLocale, t } = useLocale();
  const trigger = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>();
  useEffect(() => {
    // Starlight's mobile navigation is a native top-layer popover.
    // Keep Radix's portal within it rather than behind it in document.body.
    setPortalContainer(trigger.current?.closest<HTMLElement>('sl-sidebar-pane') ?? undefined);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const current = readTheme();
      setTheme(current);
      applyTheme(current);
      document.documentElement.dataset.theme = current === 'dark' || (current === 'system' && media.matches) ? 'dark' : 'light';
    };
    update();
    const unsubscribe = subscribeTheme(update);
    media.addEventListener('change', update);
    document.addEventListener('astro:after-swap', update);
    return () => {
      unsubscribe();
      media.removeEventListener('change', update);
      document.removeEventListener('astro:after-swap', update);
    };
  }, []);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs font-medium" aria-label="Language" title={t('Language: English', '界面语言：简体中文')}>
        <IconLanguage size={16} />
        <span data-lang="en">EN</span>
        <span data-lang="zh">中文</span>
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" container={portalContainer} className="w-40">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground"><IconLanguage size={14} />{t('Language', '界面语言')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label="Language" value={locale} onValueChange={value => setLocale(value as Locale)}>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon" aria-label="Color mode" title={t(`Color mode: ${theme}`, `外观模式：${theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统'}`)}>
        {theme === 'dark' ? <IconMoon /> : theme === 'light' ? <IconSun /> : <IconDeviceDesktop />}
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" container={portalContainer} className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('Appearance', '外观模式')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
          <DropdownMenuRadioItem value="system"><IconDeviceDesktop />{t('System', '跟随系统')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light"><IconSun />{t('Light', '浅色')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><IconMoon />{t('Dark', '深色')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </>;
}
