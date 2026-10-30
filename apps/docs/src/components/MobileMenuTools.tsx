import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
import { useLocale } from '../../../dashboard/src/app/locale';

export default function MobileMenuTools() {
  useLocale();
  return <div className="flex items-center justify-between"><Button variant="ghost" onClick={event=>{event.stopPropagation();document.getElementById('starlight__sidebar')?.hidePopover();document.querySelector<HTMLButtonElement>('site-search button')?.click();}}><IconSearch/><span data-lang="en">Search documentation</span><span data-lang="zh">搜索文档</span></Button><ThemeMenu/></div>;
}
