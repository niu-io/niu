import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
import PublicNavigationMenu from './PublicNavigationMenu';
import navigation from '../../../../branding/public-navigation.json';
export default function PublicHeader({path,brandSrc}:{path:string;brandSrc:string}) {
 return <header className="public-header"><div className="docs-header"><a className="docs-brand" href="/" aria-label="Niu home"><img src={brandSrc} alt="" width={28} height={28}/><span>Niu</span></a><nav aria-label="Documentation navigation">{navigation.map(({label,href})=><a key={href} href={href} aria-current={path.startsWith(href)?'page':undefined}>{label}</a>)}</nav><div className="docs-header-tools"><Button asChild variant="ghost" size="icon" className="public-search"><a href="/docs/?search=1" aria-label="Search documentation"><IconSearch size={16}/></a></Button><ThemeMenu/></div><div className="public-mobile-menu"><PublicNavigationMenu path={path}/></div></div></header>;
}
