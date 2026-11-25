import { useEffect, useState } from 'react';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DashboardContext } from './dashboard-context';
import { readTheme, saveTheme, subscribeTheme, type Theme } from './theme';
import { useLocale } from './ui-locale';

/** Compact color-mode switcher for the sidebar footer, sharing the persisted theme with Settings. */
export default function ThemeMenu({ context, side = "top" }: { context: DashboardContext; side?: "top" | "bottom" }) {
  const { t } = useLocale();
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => subscribeTheme(() => setTheme(readTheme())), []);
  const label = t('Color mode', '外观模式');
  const Icon = theme === 'light' ? IconSun : theme === 'dark' ? IconMoon : IconDeviceDesktop;
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" aria-label={label} disabled={Boolean(context.session && context.appearance?.ready === false)}>
            <Icon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent side={side} align="end" sideOffset={8}>
      <DropdownMenuLabel className="text-xs text-muted-foreground" aria-live="polite">{context.appearance?.saving ? t('Saving color mode…', '正在保存外观模式…') : label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-label={label} value={theme} onValueChange={value => saveTheme(value as Theme)}>
        <DropdownMenuRadioItem value="system"><IconDeviceDesktop />{t('System', '跟随系统')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light"><IconSun />{t('Light', '浅色')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><IconMoon />{t('Dark', '深色')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
