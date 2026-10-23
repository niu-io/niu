import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useLocale } from '@/app/locale';

export default function NotFoundRoute() {
  const { t } = useLocale();
  return <>
    <PageHeader title={t('Page not found', '页面未找到')} />
    <Empty className="not-found-empty">
      <EmptyHeader><EmptyTitle role="heading" aria-level={2}>{t('We couldn’t find this page', '未找到此页面')}</EmptyTitle><EmptyDescription>{t('This link may be outdated.', '此链接可能已过期。')}</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild variant="outline"><Link to="..">{t('Return to overview', '返回概览')}</Link></Button></EmptyContent>
    </Empty>
  </>;
}
