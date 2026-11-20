import { translateUI } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import DetectorPreview from './DetectorPreview';
import type { DetectorBinding } from './ExternalDetectors';
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { IconHistory, IconRefresh } from "@tabler/icons-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cachedGet, markCachedStale, peekCachedGet, request, VendorRequestError } from "@/features/providers/api";
import { FormSectionSkeleton, TableSkeleton } from "@/components/PageSkeletons";
import { presets } from "./rules";

type Revision = {
  revision: number;
  policy_name: string;
  active: boolean;
  actor_name: string;
  activated_at: string;
  restored_from_revision: number | null;
};
type Access = {
  mode: "inherit" | "allow_all" | "allow_list" | "deny_all";
  values?: string[];
};
type ContentRule = {
  pattern?: string;
  preset?: string;
  action: "block" | "redact";
};
type Version = {
  revision: number;
  policy: {
    name: string;
    models: Access;
    providers: Access;
    input_rules?: ContentRule[];
    input_detectors?: DetectorBinding[];
    output?: { mode: string; rules: ContentRule[] };
  };
};
const accessDescription = (access: Access) =>
  access.mode === "allow_list"
    ? access.values?.join(", ") || translateUI("Block all (empty allowlist)")
    : translateUI({
        inherit: "No additional restriction",
        allow_all: "Allow all",
        deny_all: "Block all",
      }[access.mode]);
type Page = { data: Revision[]; next_cursor: number | null };

export default function GuardrailHistory({
  token,
  endpoint,
  canWrite = false,
  onRestored,
}: {
  token: string;
  endpoint: string;
  canWrite?: boolean;
  onRestored?: () => void;
}) {
  const { t: uiT } = useUILocale();
  const [search, setSearch] = useSearchParams();
  const requestedRevision = search.get("revision");
  const fromBlock = search.get("from") === "blocked";
  const historyPath = `${endpoint}/history`;
  const initialPage = peekCachedGet<Page>(token, historyPath);
  const hasInitialPage = Boolean(initialPage && Array.isArray(initialPage.data));
  const [rows, setRows] = useState<Revision[]>(() => hasInitialPage ? initialPage!.data : []);
  const [cursor, setCursor] = useState<number | null>(() => hasInitialPage ? initialPage!.next_cursor : null);
  const [loading, setLoading] = useState(() => !hasInitialPage);
  const [loaded, setLoaded] = useState(() => hasInitialPage);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [detailError, setDetailError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [restored, setRestored] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const versionOpener = useRef<HTMLButtonElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  const lastReload = useRef(0);

  function closeVersion() {
    setSelected(null);
    if (requestedRevision) setSearch(current => { current.delete('revision'); current.delete('from'); return current; }, {replace:true});
  }
  useEffect(() => {
    if (!requestedRevision || !/^[1-9][0-9]*$/.test(requestedRevision)) return;
    const revision = Number(requestedRevision);
    if (!Number.isSafeInteger(revision)) return;
    setSelected(current => current?.revision === revision ? current : rows.find(row => row.revision === revision) ?? {
      revision, policy_name:'Saved policy', active:false, actor_name:'', activated_at:'', restored_from_revision:null,
    });
  }, [requestedRevision, rows]);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    const force = lastReload.current !== reload;
    lastReload.current = reload;
    setLoading(true);
    if (force) setLoaded(false);
    setError("");
    cachedGet<Page>(token, historyPath, {
      signal: controller.signal,
      force,
    })
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.data);
        setCursor(page.next_cursor);
        setLoaded(true);
      })
      .catch((cause) => {
        markCachedStale(token, historyPath);
        if (!controller.signal.aborted) {
          setLoaded(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load policy history.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          pending.current = null;
        }
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [token, historyPath, reload]);

  useEffect(() => {
    setDetailError("");
    setConflict(false);
    if (!selected) {
      setVersion(null);
      return;
    }
    const revPath = `${endpoint}/revisions/${selected.revision}`;
    const cachedVersion = peekCachedGet<{ data: Version }>(token, revPath)?.data;
    setVersion(cachedVersion && cachedVersion.revision === selected.revision && cachedVersion.policy ? cachedVersion : null);
    const controller = new AbortController();
    cachedGet<{ data: Version }>(token, revPath, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.data?.revision !== selected.revision || !result.data.policy) throw new Error('The requested policy version could not be confirmed.');
        setVersion(result.data);
      })
      .catch((cause) => {
        markCachedStale(token, revPath);
        if (!controller.signal.aborted)
          setDetailError(
            cause instanceof Error
              ? cause.message
              : "Could not load this policy version.",
          );
      });
    return () => controller.abort();
  }, [selected, token, endpoint]);

  async function restore() {
    const active = rows.find((row) => row.active);
    if (
      !canWrite ||
      !version ||
      !active ||
      active.revision === version.revision ||
      restoring ||
      conflict
    )
      return;
    setRestoring(true);
    setDetailError("");
    try {
      await request(token, `${endpoint}/rollback`, "POST", {
        expected_revision: active.revision,
        target_revision: version.revision,
      });
      closeVersion();
      setRestored(true);
      onRestored?.();
      setReload((value) => value + 1);
    } catch (cause) {
      const stale = cause instanceof VendorRequestError && cause.status === 409;
      setConflict(stale);
      setDetailError(
        stale
          ? "The active policy changed. Reload history before restoring a version."
          : cause instanceof Error
            ? cause.message
            : "Could not restore the policy.",
      );
    } finally {
      setRestoring(false);
    }
  }

  async function older() {
    if (loading || cursor === null || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const page = await request<Page>(
        token,
        `${endpoint}/history?before_revision=${cursor}`,
        "GET",
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setRows((current) => [
          ...current,
          ...page.data.filter(
            (row) =>
              !current.some((existing) => existing.revision === row.revision),
          ),
        ]);
        setCursor(page.next_cursor);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load older versions.",
        );
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="guardrails-page">
      <PageHeader title={uiT("Policy history")} action={
        <Button ref={refreshButton} variant="outline" className="header-icon-action aria-disabled:opacity-50" aria-label={uiT("Refresh policy history")} title={uiT("Refresh policy history")} aria-disabled={loading || restoring} onClick={() => {if (!loading && !restoring) setReload(value => value + 1);}}>
          <IconRefresh aria-hidden="true" /><span>{uiT("Refresh")}</span>
        </Button>
      } />
      
      
      {restored && (
        <p role="status">{uiT("Policy restored as a new active version.")}</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {uiT(error)}{" "}
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              {uiT("Reload")}</Button>
          </AlertDescription>
        </Alert>
      )}
      {loaded && !rows.length && <Empty className="guardrails-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconHistory aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>{uiT("No policy versions yet")}</EmptyTitle>
          <EmptyDescription>{uiT("Saved workspace policies will appear here.")}</EmptyDescription>
        </EmptyHeader>
        {canWrite && <EmptyContent><Button asChild variant="outline"><Link to="?tab=policy">{uiT("Configure policy")}</Link></Button></EmptyContent>}
      </Empty>}
      {loaded && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">{uiT("Version")}</TableHead>
              <TableHead>{uiT("Policy")}</TableHead>
              <TableHead className="hidden sm:table-cell">{uiT("Changed by")}</TableHead>
              <TableHead className="hidden sm:table-cell">{uiT("Date")}</TableHead>
              <TableHead className="hidden sm:table-cell">{uiT("Status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.revision}>
                <TableCell className="hidden sm:table-cell">{row.revision}</TableCell>
                <TableCell className="whitespace-normal break-words">
                  <Button
                    variant="link"
                    className="guardrails-version-link max-w-full whitespace-normal text-left"
                    onClick={event => {versionOpener.current = event.currentTarget;setSelected(row);}}
                  >
                    {row.policy_name}
                  </Button>
                  {row.restored_from_revision !== null && (
                    <p className="guardrails-muted">
                      {uiT("Restored from version")}{" "}{row.restored_from_revision}
                    </p>
                  )}
                  <dl className="mt-3 grid gap-2 text-sm sm:hidden">
                    <div className="flex items-center gap-2"><dt className="text-muted-foreground">{uiT("Version")}</dt><dd>{row.revision}</dd>{row.active && <Badge variant="secondary">{uiT("Active")}</Badge>}</div>
                    <div><dt className="text-xs text-muted-foreground">{uiT("Changed by")}</dt><dd>{row.actor_name}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{uiT("Date")}</dt><dd><time dateTime={row.activated_at}>{new Date(row.activated_at).toLocaleString(readUILocale(), {dateStyle:"medium",timeStyle:"short"})}</time></dd></div>
                  </dl>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{row.actor_name}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <time dateTime={row.activated_at}>
                    {new Date(row.activated_at).toLocaleString(readUILocale(), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {row.active && <Badge variant="secondary">{uiT("Active")}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {loading && !loaded && <TableSkeleton columns={4} rows={4} label={uiT("Loading policy history…")} />}
      {loaded && cursor !== null && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void older()}
        >
          {uiT("Load older versions")}</Button>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) closeVersion();
        }}
      >
        <DialogContent className="guardrails-version-dialog" onCloseAutoFocus={event => {
          if (versionOpener.current?.isConnected) {
            event.preventDefault();
            versionOpener.current.focus();
          } else if (refreshButton.current?.isConnected) {
            event.preventDefault();
            refreshButton.current.focus();
          }
          versionOpener.current = null;
        }}>
          <DialogHeader>
            <DialogTitle>{version?.policy.name || selected?.policy_name}</DialogTitle>
            <DialogDescription>
              {uiT("Version")}{" "}{selected?.revision}
              {selected?.active ? uiT("· Active when history was loaded") : ""}
            </DialogDescription>
          </DialogHeader>
          {fromBlock && <p className="text-sm text-muted-foreground">{uiT("This is a saved policy referenced by the blocked request. A workspace administrator can change future policy; this does not change the recorded event.")}</p>}
          {fromBlock && <Button asChild variant="link" className="justify-start px-0"><Link to="?tab=blocked">{uiT("Return to blocked requests")}</Link></Button>}
          {detailError && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(detailError)}</AlertDescription>
            </Alert>
          )}
          {!version && !detailError && (
            <FormSectionSkeleton fields={3} label={uiT("Loading policy version…")} />
          )}
          {version && (
            <div className="guardrails-version-content">
              <section>
                <h3>{uiT("Models")}</h3>
                <p>{accessDescription(version.policy.models)}</p>
              </section>
              <section>
                <h3>{uiT("Providers")}</h3>
                <p>{accessDescription(version.policy.providers)}</p>
              </section>
              <section>
                <h3>{uiT("Input rules")}</h3>
                {version.policy.input_rules?.length ? (
                  <ul>
                    {version.policy.input_rules.map((rule, index) => (
                      <li key={index}>
                        <strong>
                          {rule.action === "block" ? uiT("Block") : uiT("Redact")}
                        </strong>
                        : {rule.preset ? uiT(presets.find(preset => preset.value === rule.preset)?.label ?? "Pattern name unavailable") : <code>{rule.pattern}</code>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{uiT("No input rules")}</p>
                )}
              </section>
              {Boolean(version.policy.input_detectors?.length) && <section><h3>{uiT("External input checks")}</h3><DetectorPreview token={token} endpoint={endpoint} bindings={version.policy.input_detectors!} /></section>}
              <section>
                <h3>{uiT("Output rules")}</h3>
                {version.policy.output ? (
                  <>
                    <p>{version.policy.output.mode === "observe_only" ? uiT("Observe only · response unchanged") : version.policy.output.mode === "buffered_full" ? uiT("Buffered full-text inspection") : uiT("Output mode unavailable")}</p>
                    <ul>
                      {version.policy.output.rules.map((rule, index) => (
                        <li key={index}>
                          <strong>
                            {version.policy.output?.mode === "observe_only" ? uiT("Observe") : rule.action === "block" ? uiT("Block") : uiT("Redact")}
                          </strong>
                          : {rule.preset ? uiT(presets.find(preset => preset.value === rule.preset)?.label ?? "Pattern name unavailable") : <code>{rule.pattern}</code>}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>{uiT("No output rules")}</p>
                )}
              </section>
              {canWrite && !selected?.active && (
                <p className="guardrails-muted">
                  {uiT("Restoring creates a new workspace policy version. Existing key policies continue to apply.")}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={restoring}
              onClick={closeVersion}
            >
              {uiT("Close")}</Button>
            {conflict ? (
              <Button
                onClick={() => {
                  closeVersion();
                  setReload((value) => value + 1);
                }}
              >
                {uiT("Reload history")}</Button>
            ) : (
              canWrite &&
              !selected?.active && (
                <Button
                  disabled={!version || restoring || !rows.some(row => row.active) || rows.some(row => row.active && row.revision === version.revision)}
                  onClick={() => void restore()}
                >
                  {restoring ? uiT("Restoring…") : uiT("Restore this version")}
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
