import { useState } from 'react';
import { IconCopy } from '@tabler/icons-react';
import type {
  EvaluationComparison,
  EvaluationDefinition,
  EvaluationSummary,
} from '@niu-io/sdk';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatFinancialMoney } from '@/lib/money';
import { translateUI, useLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { safeText } from '../agent-review/shared';

export function charge(dimension: string, amount: string) {
  const money = /^money:([A-Z]{3}):nanos$/.exec(dimension);
  if (money) return `${money[1]} ${formatFinancialMoney(amount, money[1])}`;
  const unit = /^unit:[^:]+:(.*):atoms$/.exec(dimension);
  if (unit) {
    const n = BigInt(amount);
    const whole = n / 1000000000n;
    const fraction = (n % 1000000000n)
      .toString()
      .replace('-', '')
      .padStart(9, '0')
      .replace(/0+$/, '');
    return `${n < 0n && whole === 0n ? '-' : ''}${whole}${fraction ? '.' + fraction : ''} ${safeText(unit[1])}`;
  }
  return translateUI('Unavailable');
}

export function EvaluationMetrics({ summary }: { summary: EvaluationSummary }) {
  const { t: uiT, format: uiF } = useUILocale();
  return (
    <div className="grid gap-5 border-b py-5 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Accepted samples')}
        </p>
        <p className="mt-1 text-xl font-medium tabular-nums">
          {summary.verdicts.accepted ?? 0} / {summary.samples}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.verdicts.rejected ?? 0} {uiT('rejected ·')}{' '}
          {summary.verdicts.unknown ?? 0} {uiT('unknown')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Input evidence')}
        </p>
        <p className="mt-1 text-xl font-medium">
          {summary.verified_inputs} {uiT('verified')}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.unverified_inputs} {uiT('unverified')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Known customer charges')}
        </p>
        <p className="mt-1 font-medium">
          {summary.customer_charge_totals.length
            ? summary.customer_charge_totals
                .map((row) => charge(row.dimension, row.amount))
                .join(' + ')
            : uiT('Unavailable')}
        </p>
        <p className="text-sm text-muted-foreground">
          {summary.unknown_charge_attempts} {uiT('of')} {summary.attempts}{' '}
          {uiT('attempts have unknown charges')}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          {uiT('Cost per accepted sample')}
        </p>
        <p className="mt-1 font-medium">
          {summary.cost_per_accepted
            ? uiF('{0} / {1} accepted', [
                charge(
                  summary.cost_per_accepted.dimension,
                  summary.cost_per_accepted.numerator,
                ),
                summary.cost_per_accepted.denominator,
              ])
            : uiT('Insufficient comparable charge evidence')}
        </p>
      </div>
    </div>
  );
}

export function EvaluationComparisonTable({
  comparison,
}: {
  comparison: EvaluationComparison;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const values: Array<[string, (summary: EvaluationSummary) => string]> = [
    [
      'Accepted samples',
      (summary) => `${summary.verdicts.accepted ?? 0} / ${summary.samples}`,
    ],
    [
      'Rejected / unknown judgments',
      (summary) =>
        `${summary.verdicts.rejected ?? 0} / ${summary.verdicts.unknown ?? 0}`,
    ],
    [
      'Verified / unverified inputs',
      (summary) => `${summary.verified_inputs} / ${summary.unverified_inputs}`,
    ],
    [
      'Known customer charges',
      (summary) =>
        summary.customer_charge_totals
          .map((row) => charge(row.dimension, row.amount))
          .join(' + ') || uiT('Unavailable'),
    ],
    [
      'Unknown-charge attempts',
      (summary) => `${summary.unknown_charge_attempts} / ${summary.attempts}`,
    ],
    [
      'Cost per accepted sample',
      (summary) =>
        summary.cost_per_accepted
          ? uiF('{0} / {1} accepted', [
              charge(
                summary.cost_per_accepted.dimension,
                summary.cost_per_accepted.numerator,
              ),
              summary.cost_per_accepted.denominator,
            ])
          : uiT('Insufficient charge evidence'),
    ],
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Metric')}
          </TableHead>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Baseline')}
          </TableHead>
          <TableHead className="w-1/3 whitespace-normal">
            {uiT('Current run')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {values.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell className="whitespace-normal align-top font-medium">
              {uiT(label)}
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              {value(comparison.left_summary)}
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              {value(comparison.right_summary)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EvaluationWorkflowOverview() {
  const { t } = useLocale();
  return (
    <div className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {t('Step 1 · What to evaluate', '第 1 步 · 定义评测基准')}
        </p>
        <p className="text-sm font-medium">
          {t(
            'Define task, rubric & test samples',
            '设定任务、验收标准与测试样本',
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'Create an evaluation suite with your task goal, pass/fail rubric, protocol, and sample inputs so every model or routing rule is tested on identical inputs.',
            '创建评估集，明确业务任务目标、通过/拒绝标准（Rubric）、请求协议与测试样本，确保所有候选模型或路由规则在完全一致的输入下对比。',
          )}
        </p>
      </div>
      <div className="space-y-1">
        <p className="space-y-0.5 text-xs font-medium text-muted-foreground">
          {t('Step 2 · How to run', '第 2 步 · 运行模型或路由规则')}
        </p>
        <p className="text-sm font-medium">
          {t(
            'Run a candidate model or pool/<slug>',
            '调用候选模型或路由规则并记录判定',
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'Send each sample through Niu with x-niu-evaluation: <slug>@<rev>/<sample> using a model or routing rule, then record accepted/rejected verdicts.',
            '使用候选模型或路由规则（pool/<slug>）携带请求头 x-niu-evaluation: <slug>@<rev>/<sample> 发起调用，并提交每个样本的通过/拒绝判定。',
          )}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {t('Step 3 · How to decide', '第 3 步 · 对比通过率与成本')}
        </p>
        <p className="text-sm font-medium">
          {t(
            'Compare pass rate, latency & cost',
            '对比通过率、耗时与单次合格成本',
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'Compare candidate runs against a baseline side-by-side on verified sample acceptance rate, duration, and actual gateway cost per accepted sample.',
            '将候选运行与基线运行并排对比，直观查看验证样本通过率、响应耗时以及网关实际计费的单次合格成本（Cost per accepted sample）。',
          )}
        </p>
      </div>
    </div>
  );
}

export function EvaluationSampleCriteriaSection({
  definition,
  routeWorkspace,
  onError,
}: {
  definition: EvaluationDefinition;
  routeWorkspace: string;
  onError: (message: string) => void;
}) {
  const { t } = useLocale();
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const runPrompt = `Use Niu to run evaluation "${definition.slug}" (revision ${definition.revision}, protocol ${definition.protocol}) in workspace ${window.location.origin}/workspaces/${encodeURIComponent(routeWorkspace)}. Execute each sample (${definition.samples.map((s) => s.reference).join(', ')}) with header "x-niu-evaluation: ${definition.slug}@${definition.revision}/<sample>", judge outputs against the rubric, and record the evaluation run via POST /v1/evaluations/${definition.slug}/runs.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3.5">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {t(
              'How to run this evaluation against a model or routing rule',
              '如何针对模型或路由规则运行此评估',
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'Attach the x-niu-evaluation header when calling Niu Gateway so each attempt is verified against the sample SHA-256 fingerprint, then submit verdicts to POST /v1/evaluations/<slug>/runs.',
              '调用 Niu 网关时附带下方 x-niu-evaluation 请求头以校验样本指纹并绑定真实计费，随后将判定结果提交至 POST /v1/evaluations/<slug>/runs。',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              .writeText(runPrompt)
              .then(() => setCopiedPrompt(true))
              .catch(() =>
                onError('Clipboard unavailable. Read the agent workflow in Docs.'),
              );
          }}
        >
          <IconCopy size={14} />
          {copiedPrompt
            ? t('Copied run prompt', '已复制运行指令')
            : t('Copy agent run prompt', '复制智能体运行指令')}
        </Button>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">
          {t('Pinned test samples', '绑定的测试样本')} ({definition.samples.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Sample ID', '样本编号')}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t('Request SHA-256 fingerprint', '请求 SHA-256 指纹')}
              </TableHead>
              <TableHead>{t('Gateway binding header', '网关绑定请求头')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {definition.samples.map((sample) => {
              const headerValue = `${definition.slug}@${definition.revision}/${sample.reference}`;
              return (
                <TableRow key={sample.reference}>
                  <TableCell className="font-mono text-xs font-medium">
                    {safeText(sample.reference)}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {sample.request_sha256.slice(0, 16)}…
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        x-niu-evaluation: {safeText(headerValue)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(`x-niu-evaluation: ${headerValue}`)
                            .then(() => setCopiedHeader(sample.reference))
                            .catch(() =>
                              onError(
                                'Clipboard unavailable. Read the agent workflow in Docs.',
                              ),
                            );
                        }}
                      >
                        {copiedHeader === sample.reference
                          ? t('Copied', '已复制')
                          : t('Copy', '复制')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
