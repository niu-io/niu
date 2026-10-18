import { useEffect, useState } from 'react';
import { IconMenu2, IconSearch, IconDeviceDesktop, IconSun, IconMoon } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../../../dashboard/src/components/ui/dropdown-menu';
import navigation from '../../../../branding/public-navigation.json';
import { documentationSection } from '../navigation';
type Theme='system'|'light'|'dark';
function read():Theme {try{const value=localStorage.getItem('niu-dashboard-theme');return value==='dark'||value==='light'?value:'system';}catch{return 'system';}}
export default function PublicNavigationMenu({path}:{path:string}) {
 const [theme,setTheme]=useState<Theme>('system');
 useEffect(()=>{const update=()=>setTheme(read());update();window.addEventListener('niu-theme-change',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('niu-theme-change',update);window.removeEventListener('storage',update);};},[]);
 const activeSection = path.startsWith('/docs/') ? documentationSection(path) : null;
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Navigation menu"><IconMenu2/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64">{navigation.map(item=><DropdownMenuItem key={item.href} asChild><a href={item.href} aria-current={(activeSection ? item.label === activeSection : path.startsWith(item.href))?'page':undefined}>{item.label}</a></DropdownMenuItem>)}<DropdownMenuSeparator/><DropdownMenuItem asChild><a href="/docs/?search=1"><IconSearch/>Search documentation</a></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuLabel>Appearance</DropdownMenuLabel><DropdownMenuRadioGroup value={theme} onValueChange={value=>{const next=value as Theme;try{localStorage.setItem('niu-dashboard-theme',next);}catch{}const dark=next==='dark'||(next==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';setTheme(next);window.dispatchEvent(new CustomEvent('niu-theme-change'));}}><DropdownMenuRadioItem value="system"><IconDeviceDesktop/>System</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><IconSun/>Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><IconMoon/>Dark</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}
