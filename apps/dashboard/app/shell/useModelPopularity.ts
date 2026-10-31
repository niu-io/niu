import { useMemo } from 'react';
import type { Model } from './dashboard-context';
import { useCachedQuery } from '@/lib/query-cache';

type RequestRecord = { model?: string };

// Without workspace traffic, favor familiar model families for the first
// interaction. Once requests exist, observed workspace use becomes the main
// ranking signal; the catalog itself remains provider-neutral.
const familiarFamilies = [
  'anthropic/', 'claude', 'openai/', 'gpt-', 'google/', 'gemini',
  'deepseek/', 'deepseek', 'qwen/', 'qwen', 'meta-llama/', 'llama',
  'x-ai/', 'grok', 'mistralai/', 'mistral', 'cohere/', 'command-r',
];

function fallbackRank(model: Model, index: number) {
  const identity = `${model.id} ${model.upstream_model ?? ''} ${model.provider ?? ''}`.toLowerCase();
  const family = familiarFamilies.findIndex(name => identity.includes(name));
  return family < 0 ? familiarFamilies.length + index : family;
}

export function useModelPopularity(models: Model[], token: string, organizationId?: string, projectId?: string) {
  const baseModels = useMemo(() => {
    const fallbackOrder = new Map(models.map((model, index) => [model.id, index]));
    return [...models].sort((a, b) => fallbackRank(a, fallbackOrder.get(a.id) ?? 0) - fallbackRank(b, fallbackOrder.get(b.id) ?? 0));
  }, [models]);

  const path =
    token && organizationId && projectId
      ? `/api/v1/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/requests?limit=100`
      : null;

  const { data: requestPage } = useCachedQuery<{ data?: RequestRecord[] } | null>(
    token,
    path ? `GET:${path}` : null,
    async signal => {
      const response = await fetch(path!, { headers: { authorization: `Bearer ${token}` }, signal });
      if (!response.ok) return null;
      return (await response.json()) as { data?: RequestRecord[] };
    },
    { enabled: Boolean(path), keepPreviousData: false, freshMs: 30_000 },
  );

  const counts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const request of requestPage?.data ?? []) {
      if (request.model) next[request.model] = (next[request.model] ?? 0) + 1;
    }
    return next;
  }, [requestPage]);

  const rankedModels = useMemo(() => {
    const fallbackOrder = new Map(baseModels.map((model, index) => [model.id, index]));
    return [...baseModels].sort((a, b) => {
      const usage = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
      return usage || fallbackRank(a, fallbackOrder.get(a.id) ?? 0) - fallbackRank(b, fallbackOrder.get(b.id) ?? 0);
    });
  }, [baseModels, counts]);

  return { models: rankedModels, counts, hasWorkspaceHistory: Object.keys(counts).length > 0 };
}
