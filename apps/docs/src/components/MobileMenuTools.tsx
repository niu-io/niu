import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
export default function MobileMenuTools() {return <div className="flex items-center justify-between"><Button variant="ghost" onClick={event=>{event.stopPropagation();document.getElementById('starlight__sidebar')?.hidePopover();document.querySelector<HTMLButtonElement>('site-search button')?.click();}}><IconSearch/>Search documentation</Button><ThemeMenu/></div>;}
