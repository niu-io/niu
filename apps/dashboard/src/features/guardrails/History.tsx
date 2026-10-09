import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
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
import { request, VendorRequestError } from "@/features/vendors/api";

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
    input_detectors?: unknown[];
    output?: { mode: string; rules: ContentRule[] };
  };
};
const accessDescription = (access: Access) =>
  access.mode === "allow_list"
    ? access.values?.join(", ") || "Block all (empty allowlist)"
    : {
        inherit: "No additional restriction",
        allow_all: "Allow all",
        deny_all: "Block all",
      }[access.mode];
type Page = { data: Revision[]; next_cursor: number | null };

export default function GuardrailHistory({
  token,
  endpoint,
  canWrite = false,
}: {
  token: string;
  endpoint: string;
  canWrite?: boolean;
}) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setLoaded(false);
    setError("");
    request<Page>(
      token,
      `${endpoint}/history`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.data);
        setCursor(page.next_cursor);
        setLoaded(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load policy history.",
          );
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
  }, [token, endpoint, reload]);

  useEffect(() => {
    setVersion(null);
    setDetailError("");
    setConflict(false);
    if (!selected) return;
    const controller = new AbortController();
    request<{ data: Version }>(
      token,
      `${endpoint}/revisions/${selected.revision}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setVersion(result.data);
      })
      .catch((cause) => {
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
      setSelected(null);
      setRestored(true);
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
      <PageHeader title="Policy history" action={
        <Button variant="outline" className="header-icon-action aria-disabled:opacity-50" aria-label="Refresh policy history" title="Refresh policy history" aria-disabled={loading || restoring} onClick={() => {if (!loading && !restoring) setReload(value => value + 1);}}>
          <IconRefresh aria-hidden="true" /><span>Refresh</span>
        </Button>
      } />
      
      
      {restored && (
        <p role="status">Policy restored as a new active version.</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Reload
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loaded && !rows.length && <Empty className="guardrails-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconHistory aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No policy versions yet</EmptyTitle>
          <EmptyDescription>Saved workspace policies will appear here.</EmptyDescription>
        </EmptyHeader>
        {canWrite && <EmptyContent><Button asChild variant="outline"><Link to="../policy" relative="path">Configure policy</Link></Button></EmptyContent>}
      </Empty>}
      {loaded && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">Version</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead className="hidden sm:table-cell">Changed by</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
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
                      Restored from version {row.restored_from_revision}
                    </p>
                  )}
                  <dl className="mt-3 grid gap-2 text-sm sm:hidden">
                    <div className="flex items-center gap-2"><dt className="text-muted-foreground">Version</dt><dd>{row.revision}</dd>{row.active && <Badge variant="secondary">Active</Badge>}</div>
                    <div><dt className="text-xs text-muted-foreground">Changed by</dt><dd>{row.actor_name}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Date</dt><dd><time dateTime={row.activated_at}>{new Date(row.activated_at).toLocaleString(undefined, {dateStyle:"medium",timeStyle:"short"})}</time></dd></div>
                  </dl>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{row.actor_name}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <time dateTime={row.activated_at}>
                    {new Date(row.activated_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {row.active && <Badge variant="secondary">Active</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {loading && <p role="status">Loading policy history…</p>}
      {loaded && cursor !== null && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void older()}
        >
          Load older versions
        </Button>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setSelected(null);
        }}
      >
        <DialogContent className="guardrails-version-dialog" onCloseAutoFocus={event => {
          if (versionOpener.current?.isConnected) {
            event.preventDefault();
            versionOpener.current.focus();
          }
          versionOpener.current = null;
        }}>
          <DialogHeader>
            <DialogTitle>{selected?.policy_name}</DialogTitle>
            <DialogDescription>
              Version {selected?.revision}
              {selected?.active ? " · Active when history was loaded" : ""}
            </DialogDescription>
          </DialogHeader>
          {detailError && (
            <Alert variant="destructive">
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          )}
          {!version && !detailError && (
            <p role="status">Loading policy version…</p>
          )}
          {version && (
            <div className="guardrails-version-content">
              <section>
                <h3>Models</h3>
                <p>{accessDescription(version.policy.models)}</p>
              </section>
              <section>
                <h3>Providers</h3>
                <p>{accessDescription(version.policy.providers)}</p>
              </section>
              <section>
                <h3>Input rules</h3>
                {version.policy.input_rules?.length ? (
                  <ul>
                    {version.policy.input_rules.map((rule, index) => (
                      <li key={index}>
                        <strong>
                          {rule.action === "block" ? "Block" : "Redact"}
                        </strong>
                        : <code>{rule.preset ?? rule.pattern}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No input rules</p>
                )}
              </section>
              {Boolean(version.policy.input_detectors?.length) && <section><h3>External input checks</h3><p>{version.policy.input_detectors?.length} required {version.policy.input_detectors?.length === 1 ? "check" : "checks"} · matches and unavailable services block requests</p></section>}
              <section>
                <h3>Output rules</h3>
                {version.policy.output ? (
                  <>
                    <p>{version.policy.output.mode === "observe_only" ? "Observe only · response unchanged" : version.policy.output.mode === "buffered_full" ? "Buffered full-text inspection" : "Output mode unavailable"}</p>
                    <ul>
                      {version.policy.output.rules.map((rule, index) => (
                        <li key={index}>
                          <strong>
                            {version.policy.output?.mode === "observe_only" ? "Observe" : rule.action === "block" ? "Block" : "Redact"}
                          </strong>
                          : <code>{rule.preset ?? rule.pattern}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>No output rules</p>
                )}
              </section>
              {canWrite && !selected?.active && (
                <p className="guardrails-muted">
                  Restoring creates a new workspace policy version. Existing key
                  policies continue to apply.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={restoring}
              onClick={() => setSelected(null)}
            >
              Close
            </Button>
            {conflict ? (
              <Button
                onClick={() => {
                  setSelected(null);
                  setReload((value) => value + 1);
                }}
              >
                Reload history
              </Button>
            ) : (
              canWrite &&
              !selected?.active && (
                <Button
                  disabled={!version || restoring}
                  onClick={() => void restore()}
                >
                  {restoring ? "Restoring…" : "Restore this version"}
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
