import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
import { useLocale } from '../../../dashboard/src/app/locale';

export default function MobileMenuTools() {
  const { t } = useLocale();
  return <div className="flex items-center justify-between"><Button variant="ghost" onClick={event=>{event.stopPropagation();document.getElementById('starlight__sidebar')?.hidePopover();document.querySelector<HTMLButtonElement>('site-search button')?.click();}}><IconSearch/>{t('Search documentation', '搜索文档')}</Button><ThemeMenu/></div>;
}
