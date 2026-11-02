import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { fetchQuery, isAbortError, peekQuery } from '@/lib/query-cache';
import type { Model } from './dashboard-context';

const EMPTY_MODELS: Model[] = [];

export type CatalogModelsParams = {
  token: string;
  authorityKey: string;
  modelOrganizationId: string | undefined;
  modelWorkspaceId: string | undefined;
  connectionRevision: MutableRefObject<number>;
  connectionController: MutableRefObject<AbortController | null>;
  latestAuthorityRef: MutableRefObject<{ authorityKey: string }>;
};

export function useCatalogModels({
  token,
  authorityKey,
  modelOrganizationId,
  modelWorkspaceId,
  connectionRevision,
  connectionController,
  latestAuthorityRef,
}: CatalogModelsParams) {
  const [rawModels, setModels] = useState<Model[]>([]);
  const [modelsLoadedFor, setModelsLoadedFor] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const modelController = useRef<AbortController | null>(null);

  const models = Boolean(authorityKey && modelsLoadedFor === authorityKey) ? rawModels : EMPTY_MODELS;

  const modelsQueryPath = useMemo(() => {
    if (!modelOrganizationId) return '';
    return (
      '/api/v1/models?organization_id=' +
      encodeURIComponent(modelOrganizationId) +
      (modelWorkspaceId ? '&project_id=' + encodeURIComponent(modelWorkspaceId) : '')
    );
  }, [modelOrganizationId, modelWorkspaceId]);

  const abortModels = useCallback(() => {
    modelController.current?.abort();
  }, []);

  const resetModels = useCallback((loading: boolean) => {
    modelController.current?.abort();
    setModels([]);
    setModelsLoadedFor('');
    setModelsError('');
    setModelsLoading(loading);
  }, []);

  const refreshModels = useCallback(
    async (force = false) => {
      if (!token || !authorityKey || !modelsQueryPath) return;
      const connection = connectionController.current;
      if (!connection || connection.signal.aborted) return;
      modelController.current?.abort();
      const controller = new AbortController();
      modelController.current = controller;
      const targetAuthority = authorityKey;
      const cached = peekQuery<{ data: Model[] }>(token, modelsQueryPath, { persist: true })?.data;
      if (Array.isArray(cached)) {
        setModels(cached);
        setModelsLoadedFor(targetAuthority);
        setModelsLoading(false);
      } else {
        setModelsLoading(true);
      }
      setModelsError('');
      const revision = connectionRevision.current;
      try {
        const value = await fetchQuery<{ data: Model[] }>(
          token,
          modelsQueryPath,
          async signal => {
            const response = await fetch(modelsQueryPath, {
              headers: { authorization: `Bearer ${token}` },
              signal,
            });
            if (!response.ok) throw new Error('Could not load the model catalog.');
            const parsed = (await response.json()) as { data: Model[] };
            if (!Array.isArray(parsed.data)) throw new Error('Invalid model catalog response.');
            return parsed;
          },
          {
            persist: true,
            force,
            awaitRevalidate: true,
            signal: AbortSignal.any([connection.signal, controller.signal]),
          },
        );
        if (
          revision === connectionRevision.current &&
          !controller.signal.aborted &&
          modelController.current === controller &&
          latestAuthorityRef.current.authorityKey === targetAuthority
        ) {
          setModels(value.data);
          setModelsLoadedFor(targetAuthority);
        }
      } catch (reason) {
        if (
          !isAbortError(reason) &&
          revision === connectionRevision.current &&
          !controller.signal.aborted &&
          modelController.current === controller &&
          latestAuthorityRef.current.authorityKey === targetAuthority
        ) {
          setModelsError('Could not load the model catalog.');
        }
      } finally {
        if (
          revision === connectionRevision.current &&
          !controller.signal.aborted &&
          modelController.current === controller &&
          latestAuthorityRef.current.authorityKey === targetAuthority
        ) {
          setModelsLoading(false);
        }
      }
    },
    [token, authorityKey, modelsQueryPath, connectionController, connectionRevision, latestAuthorityRef],
  );

  useEffect(() => {
    setModelsError('');
    if (!token || !authorityKey || !modelsQueryPath) {
      setModels([]);
      setModelsLoadedFor('');
      setModelsLoading(Boolean(token));
      return;
    }
    const cached = peekQuery<{ data: Model[] }>(token, modelsQueryPath, { persist: true })?.data;
    if (Array.isArray(cached)) {
      setModels(cached);
      setModelsLoadedFor(authorityKey);
      setModelsLoading(false);
    } else {
      // Customer selling prices are workspace-specific; clear when switching to an uncached workspace scope.
      setModels([]);
      setModelsLoadedFor('');
      setModelsLoading(true);
    }
    void refreshModels(false);
    return () => modelController.current?.abort();
  }, [token, authorityKey, modelsQueryPath, refreshModels]);

  return {
    models,
    modelsLoading,
    modelsError,
    refreshModels,
    resetModels,
    abortModels,
  };
}
