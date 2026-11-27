import { IconActivity } from '@tabler/icons-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import AgentConnection from '@/shell/AgentConnection';
import { useLocale } from '@/shell/ui-locale';

export default function OverviewQuickStart() {
  const { t } = useLocale();
  return <Empty className="gateway-task-empty gateway-first-use">
    <EmptyHeader>
      <EmptyMedia variant="icon"><IconActivity aria-hidden="true" /></EmptyMedia>
      <EmptyTitle>{t('No requests yet', '暂无请求')}</EmptyTitle>
    </EmptyHeader>
    <AgentConnection />
    <Button asChild variant="link">
      <Link to="/docs/guides/api-quickstart/" reloadDocument>{t('API quickstart', 'API 快速入门')}</Link>
    </Button>
  </Empty>;
}
