import { useEffect, useState, type FormEvent } from 'react';
import { pinyin } from 'pinyin-pro';
import {
  IconChevronDown,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import type { EvaluationDefinition, NiuAdminClient } from '@niu-io/sdk';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { invalidateForMutation } from '@/lib/query-cache';
import { useLocale } from '@/shell/ui-locale';

export type EvaluationProtocol = EvaluationDefinition['protocol'];

const EVALUATION_PROTOCOLS: Array<{
  value: EvaluationProtocol;
  labelEn: string;
  labelZh: string;
}> = [
  {
    value: 'chat',
    labelEn: 'Chat Completions (/v1/chat/completions)',
    labelZh: '对话补全 Chat (/v1/chat/completions)',
  },
  {
    value: 'responses',
    labelEn: 'Responses (/v1/responses)',
    labelZh: '响应接口 Responses (/v1/responses)',
  },
  {
    value: 'messages',
    labelEn: 'Messages (/v1/messages)',
    labelZh: '消息接口 Messages (/v1/messages)',
  },
  {
    value: 'embeddings',
    labelEn: 'Embeddings (/v1/embeddings)',
    labelZh: '向量嵌入 Embeddings (/v1/embeddings)',
  },
  {
    value: 'generate_content',
    labelEn: 'GenerateContent (/v1beta/models/...:generateContent)',
    labelZh: '生成内容 GenerateContent (/v1beta/models/...:generateContent)',
  },
];

export function evaluationSlugFromName(name: string) {
  if (!name.trim()) return '';
  const romanized = pinyin(name, {
    toneType: 'none',
    nonZh: 'consecutive',
    v: true,
  });
  const candidate =
    romanized
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'evaluation';
  return candidate === 'runs' || candidate === 'compare'
    ? `${candidate}-suite`
    : candidate;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      sorted[key] = canonicalJsonValue(item);
    }
    return sorted;
  }
  return value;
}

function buildRequestObjectFromSampleInput(
  protocol: EvaluationProtocol,
  rawInput: string,
): Record<string, unknown> {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Treat invalid JSON as a plain-text prompt below.
    }
  }
  switch (protocol) {
    case 'responses':
    case 'embeddings':
      return { input: rawInput };
    case 'generate_content':
      return {
        contents: [{ parts: [{ text: rawInput }], role: 'user' }],
      };
    default:
      return {
        messages: [{ content: rawInput, role: 'user' }],
      };
  }
}

export async function computeEvaluationRequestSha256(
  protocol: EvaluationProtocol,
  rawInput: string,
): Promise<string> {
  const requestObject = {
    ...buildRequestObjectFromSampleInput(protocol, rawInput),
  };
  for (const ignored of [
    'model',
    'stream',
    'stream_options',
    'metadata',
    'user',
  ]) {
    delete requestObject[ignored];
  }
  const canonicalJson = JSON.stringify(canonicalJsonValue(requestObject));
  const payload = `niu.evaluation.request.v1\0${protocol}\0${canonicalJson}`;
  const bytes = new TextEncoder().encode(payload);
  const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

type SampleDraft = {
  id: string;
  reference: string;
  sampleInput: string;
  requestSha256: string;
};

export function EvaluationFormDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  editingDefinition,
  cacheScope,
  workspace,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  editingDefinition: EvaluationDefinition | null;
  cacheScope: string;
  workspace: string;
  client: NiuAdminClient;
  onSaved: (saved: EvaluationDefinition) => void;
}) {
  const { t, locale } = useLocale();
  const isZh = locale === 'zh-CN';
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [protocol, setProtocol] = useState<EvaluationProtocol>('chat');
  const [task, setTask] = useState('');
  const [rubric, setRubric] = useState('');
  const [samples, setSamples] = useState<SampleDraft[]>([
    { id: 'initial-1', reference: 'sample-1', sampleInput: '', requestSha256: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormError('');
    if (editingDefinition) {
      setName(editingDefinition.name);
      setSlug(editingDefinition.slug);
      setSlugEdited(true);
      setProtocol(editingDefinition.protocol);
      setTask(editingDefinition.task);
      setRubric(editingDefinition.rubric);
      setSamples(
        editingDefinition.samples.length
          ? editingDefinition.samples.map((sample, idx) => ({
              id: `edit-${idx}-${sample.reference}`,
              reference: sample.reference,
              sampleInput: '',
              requestSha256: sample.request_sha256,
            }))
          : [{ id: 'initial-1', reference: 'sample-1', sampleInput: '', requestSha256: '' }],
      );
    } else {
      setName('');
      setSlug('');
      setSlugEdited(false);
      setProtocol('chat');
      setTask('');
      setRubric('');
      setSamples([{ id: 'initial-1', reference: 'sample-1', sampleInput: '', requestSha256: '' }]);
    }
  }, [open, editingDefinition]);

  async function updateSampleInput(
    index: number,
    nextInput: string,
    activeProtocol: EvaluationProtocol,
  ) {
    const trimmed = nextInput.trim();
    const nextDigest = trimmed
      ? await computeEvaluationRequestSha256(activeProtocol, nextInput)
      : '';
    setSamples((previous) =>
      previous.map((item, idx) =>
        idx === index
          ? {
              ...item,
              sampleInput: nextInput,
              requestSha256: nextDigest || item.requestSha256,
            }
          : item,
      ),
    );
  }

  async function handleProtocolChange(nextProtocol: EvaluationProtocol) {
    setProtocol(nextProtocol);
    const updated = await Promise.all(
      samples.map(async (sample) => {
        if (!sample.sampleInput.trim()) return sample;
        const digest = await computeEvaluationRequestSha256(
          nextProtocol,
          sample.sampleInput,
        );
        return { ...sample, requestSha256: digest };
      }),
    );
    setSamples(updated);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    const normalizedSlug = slug.trim();
    const trimmedTask = task.trim();
    const trimmedRubric = rubric.trim();

    if (
      !trimmedName ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug) ||
      normalizedSlug === 'runs' ||
      normalizedSlug === 'compare'
    ) {
      setFormError(
        t(
          'Provide a name and a valid lowercase slug (letters, digits, and hyphens).',
          '请填写评估名称与合法的小写标识（仅限字母、数字和连字符）。',
        ),
      );
      return;
    }
    if (!trimmedTask || !trimmedRubric) {
      setFormError(
        t(
          'Provide both the task description and the acceptance rubric.',
          '请同时填写评测任务描述与验收标准（Rubric）。',
        ),
      );
      return;
    }

    const preparedSamples: Array<{ reference: string; request_sha256: string }> =
      [];
    const seenReferences = new Set<string>();
    for (const sample of samples) {
      const ref = sample.reference.trim();
      let sha = sample.requestSha256.trim().toLowerCase();
      if (!sha && sample.sampleInput.trim()) {
        sha = await computeEvaluationRequestSha256(protocol, sample.sampleInput);
      }
      if (!ref || !/^[A-Za-z0-9_.-]+$/.test(ref) || ref.length > 100) {
        setFormError(
          t(
            'Each sample needs a valid Sample ID (letters, numbers, hyphens, underscores, or dots).',
            '每个样本都需要合法的样本编号（仅限字母、数字、连字符、下划线或点号）。',
          ),
        );
        return;
      }
      if (seenReferences.has(ref)) {
        setFormError(
          t(
            'Each sample ID in an evaluation must be unique.',
            '同一评估集中的样本编号不能重复。',
          ),
        );
        return;
      }
      seenReferences.add(ref);
      if (!/^[0-9a-f]{64}$/.test(sha)) {
        setFormError(
          t(
            'Enter a sample prompt/request JSON to generate a SHA-256 fingerprint, or provide a 64-character hex SHA-256.',
            '请输入样本提示词/请求 JSON 以自动生成 SHA-256 指纹，或直接填写 64 位十六进制 SHA-256 指纹。',
          ),
        );
        return;
      }
      preparedSamples.push({ reference: ref, request_sha256: sha });
    }

    if (preparedSamples.length === 0) {
      setFormError(
        t('Add at least one test sample.', '请至少添加一个测试样本。'),
      );
      return;
    }

    setSaving(true);
    try {
      const payload: EvaluationDefinition = {
        slug: normalizedSlug,
        name: trimmedName,
        task: trimmedTask,
        rubric: trimmedRubric,
        protocol,
        revision: editingDefinition?.revision ?? 0,
        samples: preparedSamples,
      };
      const saved = await client.setWorkspaceReviewEvaluation(
        workspace,
        normalizedSlug,
        payload,
      );
      invalidateForMutation(
        cacheScope,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/evaluations/${encodeURIComponent(normalizedSlug)}`,
        'PUT',
      );
      invalidateForMutation(
        cacheScope,
        `/api/v1/workspaces/${encodeURIComponent(workspace)}/evaluations`,
        'PUT',
      );
      onSaved(saved);
      onOpenChange(false);
    } catch (reason) {
      setFormError(
        reason instanceof Error && reason.message
          ? reason.message
          : t(
              'Could not save the evaluation definition. Check your inputs and try again.',
              '无法保存评估定义，请检查输入内容后重试。',
            ),
      );
    } finally {
      setSaving(false);
    }
  }

  const activeProtocolMeta =
    EVALUATION_PROTOCOLS.find((item) => item.value === protocol) ??
    EVALUATION_PROTOCOLS[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            {editingDefinition
              ? t('Edit evaluation', '编辑评估')
              : t('Create evaluation', '创建评估')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Define the task goal, pass/fail acceptance rubric, protocol, and test samples used to benchmark models or routing rules.',
              '定义评测任务目标、通过/拒绝验收标准（Rubric）、请求协议与测试样本，用于对模型或路由规则进行基准评测。',
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="evaluation-name">
                {t('Name', '评估名称')}
              </Label>
              <Input
                id="evaluation-name"
                required
                maxLength={200}
                disabled={saving}
                value={name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  if (!editingDefinition && !slugEdited) {
                    setSlug(evaluationSlugFromName(nextName));
                  }
                }}
                placeholder={t(
                  'Invoice JSON extraction',
                  '发票 JSON 结构化提取评测',
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evaluation-slug">
                {t('Slug', '评估标识 (Slug)')}
              </Label>
              <Input
                id="evaluation-slug"
                required
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
                disabled={Boolean(editingDefinition) || saving}
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, '-')
                      .replace(/^-+|-+$/g, ''),
                  );
                }}
                placeholder={t(
                  'invoice-json-extraction',
                  'invoice-json-extraction',
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('Request protocol', '请求协议')}</Label>
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    className="w-full justify-between"
                  >
                    <span>
                      {isZh
                        ? activeProtocolMeta.labelZh
                        : activeProtocolMeta.labelEn}
                    </span>
                    <IconChevronDown size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  <DropdownMenuRadioGroup
                    value={protocol}
                    onValueChange={(value) =>
                      void handleProtocolChange(value as EvaluationProtocol)
                    }
                  >
                    {EVALUATION_PROTOCOLS.map((item) => (
                      <DropdownMenuRadioItem key={item.value} value={item.value}>
                        {isZh ? item.labelZh : item.labelEn}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evaluation-task">
              {t('Task description', '评测任务描述 (Task)')}
            </Label>
            <Textarea
              id="evaluation-task"
              required
              rows={2}
              maxLength={4000}
              disabled={saving}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder={t(
                'Describe the real workspace task being evaluated (e.g., Extract invoice number, vendor, date, and line items as strict JSON).',
                '描述要评测的真实业务任务（例如：从发票文本中提取发票号、开票方、日期和明细行，输出严格合法的 JSON）。',
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evaluation-rubric">
              {t('Acceptance rubric (Pass / Fail criteria)', '验收标准 (Rubric — 什么算通过/拒绝)')}
            </Label>
            <Textarea
              id="evaluation-rubric"
              required
              rows={3}
              maxLength={8000}
              disabled={saving}
              value={rubric}
              onChange={(event) => setRubric(event.target.value)}
              placeholder={t(
                'Define when a sample output counts as accepted vs rejected (e.g., Accept only if JSON parses cleanly and all numeric totals match the source text without hallucinated fields).',
                '定义样本输出被判定为通过（accepted）或拒绝（rejected）的具体标准（例如：仅当 JSON 语法合法且所有金额字段与原文完全一致、无编造字段时判定为通过）。',
              )}
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>{t('Test samples', '测试样本 (Samples)')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Enter a sample prompt or request JSON to compute its SHA-256 fingerprint automatically. Niu stores only the fingerprint so private prompts stay local.',
                    '输入样本提示词或请求 JSON 即可自动计算 SHA-256 指纹。Niu 仅保存请求指纹以校验两次对比输入一致，不存储原始私有提示词。',
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || samples.length >= 64}
                onClick={() =>
                  setSamples((previous) => [
                    ...previous,
                    {
                      id: `sample-${Date.now()}-${previous.length + 1}`,
                      reference: `sample-${previous.length + 1}`,
                      sampleInput: '',
                      requestSha256: '',
                    },
                  ])
                }
              >
                <IconPlus size={14} />
                {t('Add sample', '添加样本')}
              </Button>
            </div>

            <div className="space-y-3">
              {samples.map((sample, index) => (
                <div
                  key={sample.id}
                  className="space-y-2.5 rounded-lg bg-muted/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={`sample-ref-${index}`} className="text-xs">
                        {t('Sample ID', '样本编号')}
                      </Label>
                      <Input
                        id={`sample-ref-${index}`}
                        required
                        maxLength={100}
                        disabled={saving}
                        value={sample.reference}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSamples((previous) =>
                            previous.map((item, idx) =>
                              idx === index ? { ...item, reference: value } : item,
                            ),
                          );
                        }}
                        placeholder={t('sample-1', 'sample-1')}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving || samples.length <= 1}
                      onClick={() =>
                        setSamples((previous) =>
                          previous.filter((_, idx) => idx !== index),
                        )
                      }
                      aria-label={t('Remove sample', '移除样本')}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`sample-input-${index}`} className="text-xs">
                      {t(
                        'Sample prompt or request JSON (auto-computes fingerprint)',
                        '样本提示词或请求 JSON（自动计算请求指纹）',
                      )}
                    </Label>
                    <Textarea
                      id={`sample-input-${index}`}
                      rows={2}
                      disabled={saving}
                      value={sample.sampleInput}
                      onChange={(event) =>
                        void updateSampleInput(
                          index,
                          event.target.value,
                          protocol,
                        )
                      }
                      placeholder={t(
                        'Type a prompt (e.g. Summarize this PR diff...) or paste a request JSON body',
                        '输入测试提示词（如：请提取以下发票的 JSON 信息…）或粘贴请求 JSON',
                      )}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`sample-sha-${index}`} className="text-xs">
                      {t('Request SHA-256 fingerprint', '请求 SHA-256 指纹')}
                    </Label>
                    <Input
                      id={`sample-sha-${index}`}
                      required
                      maxLength={64}
                      disabled={saving}
                      className="font-mono text-xs"
                      value={sample.requestSha256}
                      onChange={(event) => {
                        const value = event.target.value.trim().toLowerCase();
                        setSamples((previous) =>
                          previous.map((item, idx) =>
                            idx === index
                              ? { ...item, requestSha256: value }
                              : item,
                          ),
                        );
                      }}
                      placeholder={t(
                        '64-char hex SHA-256 (auto-filled when you enter a prompt above)',
                        '64 位十六进制 SHA-256（在上方输入提示词后自动生成）',
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel', '取消')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? t('Saving…', '保存中…')
                : editingDefinition
                  ? t('Save changes', '保存更改')
                  : t('Create evaluation', '创建评估')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
