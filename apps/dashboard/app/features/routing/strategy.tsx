import {
  IconChevronDown,
} from '@tabler/icons-react';
import type { WorkspaceModelPool, WorkspacePoolStrategy } from '@niu-io/sdk';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/shell/ui-locale';

export type PoolStrategyDraft = {
  mode: 'priority_weight' | 'customer_price' | 'auto';
  currency: string;
  inputTokens: string;
  outputTokens: string;
  /**
   * Preserved verbatim for an existing version 2 Auto policy. The dashboard
   * does not author Auto paths; agents configure them through the API/SDK, and
   * this field prevents an edit in the dashboard from silently downgrading the
   * policy to priority/weight.
   */
  auto?: NonNullable<WorkspacePoolStrategy['auto']>;
};

export const MAX_PRICE_ASSUMPTION_TOKENS = 10_000_000;

/** Omitted legacy policies resolve to version 1 priority/weight. */
export function strategyDraftFrom(
  pool?: WorkspaceModelPool,
  defaultCurrency = 'USD',
): PoolStrategyDraft {
  const strategy = pool?.strategy;
  if (strategy?.mode === 'auto' && strategy.auto) {
    return {
      mode: 'auto',
      currency: defaultCurrency,
      inputTokens: '1000000',
      outputTokens: '100000',
      auto: strategy.auto,
    };
  }
  if (strategy?.mode === 'customer_price' && strategy.customer_price) {
    return {
      mode: 'customer_price',
      currency: strategy.customer_price.currency,
      inputTokens: String(strategy.customer_price.input_tokens),
      outputTokens: String(strategy.customer_price.output_tokens),
    };
  }
  return {
    mode: 'priority_weight',
    currency: defaultCurrency,
    inputTokens: '1000000',
    outputTokens: '100000',
  };
}

export type PoolStrategyBuild =
  | { strategy: WorkspacePoolStrategy }
  | { error: 'currency' | 'input' | 'output' | 'auto' };

/**
 * Build the versioned strategy. Currency and request-size assumptions are
 * explicit; the unit is fixed to the customer selling price unit in version 1.
 */
export function buildPoolStrategy(
  draft: PoolStrategyDraft,
): PoolStrategyBuild {
  if (draft.mode === 'priority_weight') {
    return { strategy: { version: 1, mode: 'priority_weight' } };
  }
  if (draft.mode === 'auto') {
    // Auto authoring is an agent/API workflow. Preserve an existing policy
    // byte-for-byte instead of inventing paths from dashboard state.
    if (!draft.auto) return { error: 'auto' };
    return { strategy: { version: 2, mode: 'auto', auto: draft.auto } };
  }
  const currency = draft.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'currency' };
  const inputTokens = Number(draft.inputTokens);
  const outputTokens = Number(draft.outputTokens);
  if (
    !Number.isInteger(inputTokens) ||
    inputTokens < 1 ||
    inputTokens > MAX_PRICE_ASSUMPTION_TOKENS
  ) {
    return { error: 'input' };
  }
  if (
    !Number.isInteger(outputTokens) ||
    outputTokens < 0 ||
    outputTokens > MAX_PRICE_ASSUMPTION_TOKENS
  ) {
    return { error: 'output' };
  }
  return {
    strategy: {
      version: 1,
      mode: 'customer_price',
      customer_price: {
        currency,
        unit: 'nanounits_per_million_tokens',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    },
  };
}

export function PoolStrategyFields({
  draft,
  onChange,
  disabled,
}: {
  draft: PoolStrategyDraft;
  onChange: (draft: PoolStrategyDraft) => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  const customerPrice = draft.mode === 'customer_price';
  const semanticAuto = draft.mode === 'auto';
  return (
    <div className="space-y-2.5">
      <div>
        <Label>{t('Selection strategy', '选择策略')}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            'Priority and weight is the default. Lowest customer price ranks eligible models by their current customer selling price and never uses procurement costs. Semantic Auto selects a declared path from caller task context, with an optional bounded decider.',
            '默认按优先级与权重选择。最低客户价格会按当前客户售价对可用模型排序，绝不使用采购成本。语义 Auto 会根据调用方任务上下文选择已声明的执行路径，并可选使用有界决策模型。',
          )}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={t('Selection strategy', '选择策略')}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {customerPrice
                ? t('Lowest customer price', '最低客户价格')
                : semanticAuto
                  ? t('Semantic Auto', '语义 Auto')
                  : t('Priority and weight', '优先级与权重')}
            </span>
            <IconChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          <DropdownMenuRadioGroup
            value={draft.mode}
            onValueChange={(value) =>
              onChange({
                ...draft,
                mode: value as PoolStrategyDraft['mode'],
              })
            }
          >
            <DropdownMenuRadioItem value="priority_weight">
              {t('Priority and weight', '优先级与权重')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="customer_price">
              {t('Lowest customer price', '最低客户价格')}
            </DropdownMenuRadioItem>
            {draft.auto && (
              <DropdownMenuRadioItem value="auto">
                {t('Semantic Auto', '语义 Auto')}
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {semanticAuto && draft.auto && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            {t(
              'Auto paths and decider limits are configured by an agent through the API or SDK. Saving here preserves them unchanged. Callers may supply bounded task and stage context; a deterministic context match never calls the decider.',
              'Auto 路径与决策模型限制由智能体通过 API 或 SDK 配置。在此保存会原样保留。调用方可提供有界的任务与阶段上下文；上下文直接匹配时不会调用决策模型。',
            )}
          </p>
          <ul className="space-y-1 text-xs">
            {draft.auto.paths.map((path) => (
              <li key={path.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{path.id}</span>
                <span className="text-muted-foreground">
                  {responseTypeLabel(t, path.response_type)} ·{' '}
                  {path.candidates.length} {t('models', '个模型')}
                </span>
              </li>
            ))}
          </ul>
          {draft.auto.decider ? (
            <p className="text-xs text-muted-foreground">
              {t('Decider', '决策模型')} {draft.auto.decider.model} ·{' '}
              {t('timeout', '超时')} {draft.auto.decider.timeout_ms}{' '}
              {t('ms', '毫秒')} ·{' '}
              {t('at most', '最多')} {draft.auto.decider.max_calls}{' '}
              {t('call(s)', '次调用')} ·{' '}
              {draft.auto.decider.max_input_tokens}/
              {draft.auto.decider.max_output_tokens} {t('tokens', 'Token')} ·{' '}
              {t('spend ceiling', '费用上限')}{' '}
              {draft.auto.decider.max_spend_nanos}{' '}
              {draft.auto.decider.currency} {t('nanounits', '纳单位')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(
                'No decider configured; Auto uses caller context only.',
                '未配置决策模型；Auto 仅使用调用方上下文。',
              )}
            </p>
          )}
        </div>
      )}
      {customerPrice && (
        <div className="grid gap-2.5 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label
              htmlFor="pool-price-currency"
              className="text-xs text-muted-foreground"
            >
              {t('Currency', '币种')}
            </Label>
            <Input
              id="pool-price-currency"
              required
              maxLength={3}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={disabled}
              value={draft.currency}
              onChange={(event) =>
                onChange({
                  ...draft,
                  currency: event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, ''),
                })
              }
              placeholder="USD"
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="pool-price-input-tokens"
              className="text-xs text-muted-foreground"
            >
              {t('Input tokens assumed', '假设输入 Token')}
            </Label>
            <Input
              id="pool-price-input-tokens"
              type="number"
              min={1}
              max={MAX_PRICE_ASSUMPTION_TOKENS}
              required
              disabled={disabled}
              value={draft.inputTokens}
              onChange={(event) =>
                onChange({ ...draft, inputTokens: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="pool-price-output-tokens"
              className="text-xs text-muted-foreground"
            >
              {t('Output tokens assumed', '假设输出 Token')}
            </Label>
            <Input
              id="pool-price-output-tokens"
              type="number"
              min={0}
              max={MAX_PRICE_ASSUMPTION_TOKENS}
              required
              disabled={disabled}
              value={draft.outputTokens}
              onChange={(event) =>
                onChange({ ...draft, outputTokens: event.target.value })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {t(
              'Prices are compared in currency nanounits per million tokens using these request-size assumptions, including context tiers, request fees and minimum charges. Missing or incomparable prices stay unknown; if no candidate has a comparable price, priority and weight apply. Credits-denominated plans currently fall back. Preview before saving.',
              '价格按“每个币种纳单位/百万 Token”并使用上述请求规模假设比较，包含上下文阶梯、请求固定费用与最低收费。缺失或不可比的价格保持未知；若没有候选具有可比价格，则回退到优先级与权重。按积分计费的计划目前会回退。保存前请预览。',
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function poolStrategyErrorMessage(
  t: (english: string, chinese: string) => string,
  error: 'currency' | 'input' | 'output' | 'auto',
): string {
  if (error === 'currency') {
    return t(
      'Enter a three-letter uppercase currency for customer-price routing.',
      '请为客户价格路由填写三位大写币种代码。',
    );
  }
  if (error === 'input') {
    return t(
      'Assumed input tokens must be a whole number between 1 and 10,000,000.',
      '假设输入 Token 必须是 1 至 10,000,000 之间的整数。',
    );
  }
  if (error === 'auto') {
    return t(
      'Semantic Auto paths must be configured through the API or SDK before this policy can be saved.',
      '语义 Auto 路径必须通过 API 或 SDK 配置后才能保存此策略。',
    );
  }
  return t(
    'Assumed output tokens must be a whole number between 0 and 10,000,000.',
    '假设输出 Token 必须是 0 至 10,000,000 之间的整数。',
  );
}

function responseTypeLabel(
  t: (english: string, chinese: string) => string,
  responseType: 'text' | 'structured' | 'embedding',
): string {
  return responseType === 'structured'
    ? t('Structured JSON', '结构化 JSON')
    : responseType === 'embedding'
      ? t('Embedding', '向量')
      : t('Text', '文本');
}

export function PoolStrategySummary({
  strategy,
}: {
  strategy?: WorkspacePoolStrategy;
}) {
  const { t } = useLocale();
  if (strategy?.mode === 'auto' && strategy.auto) {
    return (
      <p className="mt-2 text-sm">
        {t('Selection strategy', '选择策略')}:{' '}
        {t('Semantic Auto', '语义 Auto')} · {strategy.auto.paths.length}{' '}
        {t('paths', '条路径')}
        {strategy.auto.decider
          ? ` · ${t('bounded decider', '有界决策模型')} ${strategy.auto.decider.model}`
          : ` · ${t('caller context only', '仅使用调用方上下文')}`}
      </p>
    );
  }
  if (strategy?.mode === 'customer_price' && strategy.customer_price) {
    const price = strategy.customer_price;
    return (
      <p className="mt-2 text-sm">
        {t('Selection strategy', '选择策略')}:{' '}
        {t('Lowest customer price', '最低客户价格')} · {price.currency} ·{' '}
        {t('nanounits per million tokens', '纳单位/百万 Token')} ·{' '}
        {t('assumed input', '假设输入')} {price.input_tokens.toLocaleString()} ·{' '}
        {t('assumed output', '假设输出')} {price.output_tokens.toLocaleString()}
      </p>
    );
  }
  return (
    <p className="mt-2 text-sm">
      {t('Selection strategy', '选择策略')}:{' '}
      {t('Priority and weight', '优先级与权重')}
    </p>
  );
}
