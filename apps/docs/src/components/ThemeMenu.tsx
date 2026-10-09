import { useEffect, useRef, useState } from 'react';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../../../dashboard/src/components/ui/dropdown-menu';
import { applyTheme, readTheme, saveTheme, subscribeTheme, type Theme } from '../../../dashboard/src/app/theme';

export default function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>('system');
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
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon" aria-label="Color mode" title={`Color mode: ${theme}`}>
      {theme === 'dark' ? <IconMoon /> : theme === 'light' ? <IconSun /> : <IconDeviceDesktop />}
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" container={portalContainer}>
      <DropdownMenuRadioGroup value={theme} onValueChange={value => saveTheme(value as Theme)}>
        <DropdownMenuRadioItem value="system"><IconDeviceDesktop />System</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light"><IconSun />Light</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><IconMoon />Dark</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
