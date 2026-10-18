import { useEffect, useState } from 'react';
import { IconMenu2, IconSearch, IconDeviceDesktop, IconSun, IconMoon, IconLanguage } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../../../dashboard/src/components/ui/dropdown-menu';
import navigation from '../../../../branding/public-navigation.json';
import { useLocale, type Locale } from '../../../dashboard/src/app/locale';

type Theme='system'|'light'|'dark';
function read():Theme {try{const value=localStorage.getItem('niu-dashboard-theme');return value==='dark'||value==='light'?value:'system';}catch{return 'system';}}

const NAV_ZH: Record<string, string> = {
  'Why Niu?': '为什么选择牛元？',
  Docs: '文档',
  API: 'API',
  SDK: 'SDK',
  Compare: '对比',
};

export default function PublicNavigationMenu({path}:{path:string}) {
 const [theme,setTheme]=useState<Theme>('system');
 const { locale, setLocale, t } = useLocale();
 useEffect(()=>{const update=()=>setTheme(read());update();window.addEventListener('niu-theme-change',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('niu-theme-change',update);window.removeEventListener('storage',update);};},[]);
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Navigation menu"><IconMenu2/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64">{navigation.map(item=><DropdownMenuItem key={item.href} asChild><a href={item.href} aria-current={path.startsWith(item.href)?'page':undefined}>{t(item.label, NAV_ZH[item.label] ?? item.label)}</a></DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem asChild><a href="/docs/?search=1"><IconSearch/>{t('Search documentation', '搜索文档')}</a></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuLabel>{t('Appearance', '外观模式')}</DropdownMenuLabel><DropdownMenuRadioGroup value={theme} onValueChange={value=>{const next=value as Theme;try{localStorage.setItem('niu-dashboard-theme',next);}catch{}const dark=next==='dark'||(next==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';setTheme(next);window.dispatchEvent(new CustomEvent('niu-theme-change'));}}><DropdownMenuRadioItem value="system"><IconDeviceDesktop/>{t('System', '跟随系统')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>{t('Light', '浅色')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>{t('Dark', '深色')}</DropdownMenuRadioItem></DropdownMenuRadioGroup><DropdownMenuSeparator/><DropdownMenuLabel className="flex items-center gap-1.5"><IconLanguage size={14}/>{t('Language', '界面语言')}</DropdownMenuLabel><DropdownMenuRadioGroup aria-label="Language" value={locale} onValueChange={value=>setLocale(value as Locale)}><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem><DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}
