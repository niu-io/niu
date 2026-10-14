import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
import PublicNavigationMenu from './PublicNavigationMenu';
import navigation from '../../../../branding/public-navigation.json';
import { documentationSection } from '../navigation';
export default function PublicHeader({path,brandSrc,embedded=false}:{path:string;brandSrc:string;embedded?:boolean}) {
 return <header className="public-header"><div className="docs-header"><a className="docs-brand" href={embedded ? '/docs/' : '/'} aria-label={embedded ? 'Niu Documentation' : 'Niu home'}>{!embedded && <img src={brandSrc} alt="" width={28} height={28}/>}<span>{embedded ? 'Niu Documentation' : 'Niu'}</span></a><nav aria-label="Documentation navigation">{navigation.map(({label,href})=><a key={href} href={href} aria-current={documentationSection(path)===label?'page':undefined}>{label}</a>)}</nav><div className="docs-header-tools"><Button asChild variant="ghost" size="icon" className="public-search"><a href="/docs/?search=1" aria-label="Search documentation"><IconSearch size={16}/></a></Button><ThemeMenu/></div><div className="public-mobile-menu"><PublicNavigationMenu path={path}/></div></div></header>;
}
