import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatUnitAtoms, money } from '@/lib/money';
import { readLocale as readUILocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { IconCoins as Coins, IconHelpCircle as HelpCircle } from '@tabler/icons-react';
import { Link } from 'react-router';

export type ChargeSummarySource = {
  unresolved_customer_charge_count?: number;
  unpriced_request_count?: number;
  owner_funded_request_count?: number;
  customer_charges?: Array<{ currency: string; amount_nanos: string }>;
  customer_unit_charges?: Array<{
    name?: string;
    unit_name?: string;
    display_precision: number;
    net_atoms: string;
  }>;
};

/** Exclude explicit zero ledgers when unsettled, unpriced, or own-key exceptions remain. */
export function formatSettledChargeTotals(summary: ChargeSummarySource): string[] {
  const hasExceptions =
    (summary.unresolved_customer_charge_count ?? 0) > 0 ||
    (summary.unpriced_request_count ?? 0) > 0 ||
    (summary.owner_funded_request_count ?? 0) > 0;
  const unitTotals = (summary.customer_unit_charges ?? [])
    .filter((item) => !hasExceptions || item.net_atoms !== '0')
    .map((item) =>
      formatUnitAtoms(item.net_atoms, item.name || item.unit_name || 'Credits', item.display_precision),
    );
  const currencyTotals = (summary.customer_charges ?? [])
    .filter((item) => !hasExceptions || item.amount_nanos !== '0')
    .map((item) => money(item.amount_nanos, item.currency));
  return [...unitTotals, ...currencyTotals];
}

export type ChargeSummaryCardProps = {
  summaryReady: boolean;
  loadingCaption?: string;
  hasData: boolean;
  settledTotals: string[];
  unresolvedCount: number;
  unpricedCount: number;
  ownerFundedCount: number;
  unresolvedHref?: string;
  breakdownHref?: string;
  ratesHref?: string;
  billingHref?: string;
};

export default function ChargeSummaryCard({
  summaryReady,
  loadingCaption,
  hasData,
  settledTotals,
  unresolvedCount,
  unpricedCount,
  ownerFundedCount,
  unresolvedHref,
  breakdownHref,
  ratesHref,
  billingHref,
}: ChargeSummaryCardProps) {
  const { t: uiT, format: uiF } = useUILocale();
  const locale = readUILocale();

  const headline = !summaryReady
    ? '—'
    : !hasData
      ? uiT('Unavailable')
      : settledTotals.length
        ? settledTotals.join(' · ')
        : unresolvedCount > 0
          ? uiT('Pending settlement', '待结算')
          : unpricedCount > 0
            ? uiT('No rate set', '未配置费率')
            : ownerFundedCount > 0
              ? uiT('No Niu charge')
              : '—';

  const hasExceptions = unresolvedCount > 0 || unpricedCount > 0 || ownerFundedCount > 0;
  const linkClassName =
    'rounded-xs font-medium text-foreground underline decoration-muted-foreground/60 underline-offset-4 hover:text-primary hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring';

  return (
    <article className="panel">
      <span>
        <Coins size={16} aria-hidden="true" />
        <span className="min-w-0">{uiT('Niu charges', 'Niu 费用')}</span>
        {summaryReady && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-5 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:mt-0 [&_svg]:text-current"
                aria-label={uiT('About Niu charges', '了解 Niu 费用')}
                title={uiT('About Niu charges', '了解 Niu 费用')}
              >
                <HelpCircle size={14} aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              collisionPadding={16}
              className="w-80 max-w-[calc(100vw-32px)] space-y-2.5 text-xs leading-relaxed"
            >
              <p className="font-medium text-foreground">{uiT('How Niu charges work', 'Niu 费用说明')}</p>
              {!hasData ? (
                <p className="text-muted-foreground">
                  {uiT('Charge data is unavailable for this gateway response.', '当前网关响应不提供费用数据。')}
                </p>
              ) : (
                <div className="space-y-2 text-muted-foreground">
                  <p>{uiT('Totals show only settled charges billed through Niu.', '总额仅包含通过 Niu 平台完成结算的费用。')}</p>
                  {unresolvedCount > 0 && (
                    <p>
                      <strong className="font-medium text-foreground">{uiT('Pending settlement:', '待结算：')}</strong>{' '}
                      {uiT(
                        'Requests whose upstream outcome or usage isn’t finalized yet aren’t counted as zero. Inspect them in Logs; do not resend blindly.',
                        '请求尚未最终确认结果或用量，暂不计费也不会记为零费用。请前往日志查看详情，切勿盲目重发。',
                      )}
                    </p>
                  )}
                  {unpricedCount > 0 && (
                    <p>
                      <strong className="font-medium text-foreground">{uiT('Missing rate:', '未配置费率：')}</strong>{' '}
                      {uiT(
                        'Platform requests without a published customer rate cannot be totaled here. Review rates or contact an administrator.',
                        '平台路由请求缺少已发布的客户费率，暂无法计入总额。请查看费率或联系管理员配置。',
                      )}
                    </p>
                  )}
                  {ownerFundedCount > 0 && (
                    <p>
                      {uiT('These requests did not consume workspace credits.', '这些请求未消耗工作区额度。')}
                    </p>
                  )}
                  {!hasExceptions && (
                    <p>{uiT('All requests in this scope use settled Niu charges.', '此范围内所有请求均已完成 Niu 费用结算。')}</p>
                  )}
                </div>
              )}
              {(Boolean(unresolvedCount > 0 && unresolvedHref) || breakdownHref || billingHref) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2">
                  {unresolvedCount > 0 && unresolvedHref && (
                    <Link className={linkClassName} to={unresolvedHref}>
                      {uiT('Inspect pending requests', '查看待结算请求')}
                    </Link>
                  )}
                  {breakdownHref && (
                    <Link className={linkClassName} to={breakdownHref}>
                      {uiT('Charge breakdown', '费用明细')}
                    </Link>
                  )}
                  {billingHref && (
                    <Link className={linkClassName} to={billingHref}>
                      {uiT('Billing and rates', '账单与费率')}
                    </Link>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </span>
      <strong>{headline}</strong>
      <small className="grid gap-1">
        {!summaryReady ? (
          loadingCaption ?? uiT('Loading activity…')
        ) : !hasData ? (
          uiT('Charge data unavailable for this gateway response')
        ) : hasExceptions ? (
          <>
            {unresolvedCount > 0 && (
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span>
                  {unresolvedCount === 1
                    ? uiT('1 request awaiting settlement')
                    : uiF('{0} requests awaiting settlement', [unresolvedCount.toLocaleString(locale)])}
                </span>
                {unresolvedHref && (
                  <Link to={unresolvedHref} className={linkClassName}>
                    {uiT('Inspect', '查看请求')}
                  </Link>
                )}
              </span>
            )}
            {unpricedCount > 0 && (
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span>
                  {unpricedCount === 1
                    ? uiT('1 request without a customer rate')
                    : uiF('{0} requests without a customer rate', [unpricedCount.toLocaleString(locale)])}
                </span>
                {(ratesHref || breakdownHref) && (
                  <Link to={(ratesHref || breakdownHref)!} className={linkClassName}>
                    {ratesHref ? uiT('Review rates', '查看费率') : uiT('View breakdown', '查看明细')}
                  </Link>
                )}
              </span>
            )}
            {ownerFundedCount > 0 && (
              <span>
                {ownerFundedCount === 1
                  ? uiF('{0} without a Niu charge', [
                      ownerFundedCount.toLocaleString(locale),
                    ])
                  : uiF('{0} without a Niu charge', [
                      ownerFundedCount.toLocaleString(locale),
                    ])}
              </span>
            )}
          </>
        ) : (
          uiT('Settled Niu charges only', '仅含已结算的 Niu 费用')
        )}
      </small>
    </article>
  );
}
