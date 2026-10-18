import { IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import ThemeMenu from './ThemeMenu';
import SessionLink from './SessionLink';
import PublicNavigationMenu from './PublicNavigationMenu';
import navigation from '../../../../branding/public-navigation.json';
import { documentationSection } from '../navigation';
import { useLocale } from '../../../dashboard/src/app/locale';

const NAV_ZH: Record<string, string> = {
  'Why Niu?': '为什么选择牛元？',
  Docs: '文档',
  API: 'API',
  SDK: 'SDK',
  Compare: '对比',
};

export default function PublicHeader({path,brandSrc,embedded=false}:{path:string;brandSrc:string;embedded?:boolean}) {
 const { t } = useLocale();
 return <header className="public-header"><div className="docs-header"><a className="docs-brand" href={embedded ? '/docs/' : '/'} aria-label={embedded ? 'Niu Documentation' : 'Niu home'}>{!embedded && <img src={brandSrc} alt="" width={28} height={28}/>}<span>{embedded ? t('Niu Documentation', 'Niu 牛元文档') : t('Niu', 'Niu 牛元')}</span></a><nav aria-label="Documentation navigation">{navigation.map(({label,href})=><a key={href} href={href} aria-current={(embedded || path.startsWith('/docs/') ? documentationSection(path)===label : path.startsWith(href))?'page':undefined}>{t(label, NAV_ZH[label] ?? label)}</a>)}</nav><div className="public-session"><SessionLink/></div><div className="docs-header-tools"><Button asChild variant="ghost" size="icon" className="public-search"><a href="/docs/?search=1" aria-label="Search documentation" title={t('Search documentation', '搜索文档')}><IconSearch size={16}/></a></Button><ThemeMenu/></div><div className="public-mobile-menu"><PublicNavigationMenu path={path}/></div></div></header>;
}
