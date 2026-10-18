import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconKey, IconRefresh, IconUnlink } from "@tabler/icons-react";
import { Badge } from "../../../../dashboard/src/components/ui/badge";
import { Button } from "../../../../dashboard/src/components/ui/button";
import {
  Alert,
  AlertDescription,
} from "../../../../dashboard/src/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../../../../dashboard/src/components/ui/dropdown-menu";
import {
  displayName,
  docsLoginHref,
  metadata,
  useDocsSession,
} from "./session";

type Workspace = {
  id: string;
  name: string;
  organization_name: string;
  route_slug: string;
  created_at_ms: number;
};
type Key = { id: string; name: string; revoked: boolean; expired: boolean };
export type DocsKeySelection = {
  keyId: string;
  keyName: string;
  workspace: Workspace;
  canWrite: boolean;
};

/** Names and opaque key references only. Selection never retrieves a key secret. */
export default function WorkspaceKeyConnection({
  onChange,
  disabled = false,
  description,
  token,
}: {
  onChange: (selection: DocsKeySelection | null) => void;
  disabled?: boolean;
  description?: string;
  token?: string;
}) {
  const { session, checking, error: sessionError, refresh } = useDocsSession(token);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyId, setKeyId] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const disconnectedRef = useRef(false);
  disconnectedRef.current = disconnected;
  const [loading, setLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const identity = session
    ? JSON.stringify([session.kind, session.operator, session.permissions])
    : "";
  useEffect(() => {
    setWorkspaces([]);
    setWorkspaceId("");
    setKeys([]);
    setKeyId("");
    disconnectedRef.current = false;
    setDisconnected(false);
    setError("");
    setLoading(false);
  }, [identity]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (!identity) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const rows: Workspace[] = [],
        seen = new Set<string>();
      let after: string | null = null;
      do {
        const page: { data: Workspace[]; next_cursor: string | null } =
          await metadata(
            "/api/v1/workspaces?limit=100" +
              (after ? "&after=" + encodeURIComponent(after) : ""),
            controller.signal,
            token,
          );
        if (
          !Array.isArray(page.data) ||
          (page.next_cursor !== null &&
            (typeof page.next_cursor !== "string" ||
              seen.has(page.next_cursor)))
        )
          throw new Error("Workspace directory changed. Reload it.");
        rows.push(...page.data);
        after = page.next_cursor;
        if (after) seen.add(after);
      } while (after);
      if (!controller.signal.aborted) {
        setWorkspaces(rows);
        if (rows.length > 0) {
          let storedId: string | null = null;
          try {
            storedId = window.localStorage.getItem("niu.active-workspace");
          } catch {
            /* Storage is optional. */
          }
          const operatorProjectId = session?.operator?.project_id;
          setWorkspaceId((current) => {
            if (rows.some((row) => row.id === current)) return current;
            const preferred =
              rows.find((row) => row.id === operatorProjectId) ??
              rows.find((row) => row.id === storedId) ??
              rows[0];
            return preferred ? preferred.id : "";
          });
        } else {
          setWorkspaceId("");
        }
      }
    })()
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [identity, revision, token]);
  useEffect(() => {
    const controller = new AbortController();
    setKeys([]);
    setKeyId("");
    setKeysLoading(false);
    if (!workspaceId || !identity) return;
    setKeysLoading(true);
    setError("");
    void metadata<{ data: Key[] }>(
      "/api/v1/workspaces/" + encodeURIComponent(workspaceId) + "/keys",
      controller.signal,
      token,
    )
      .then((page) => {
        if (!controller.signal.aborted) {
          const active = page.data.filter((key) => !key.revoked && !key.expired);
          setKeys(active);
          if (active.length > 0) {
            setKeyId((current) =>
              disconnectedRef.current
                ? ""
                : active.some((item) => item.id === current)
                  ? current
                  : active[0]!.id,
            );
          }
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setKeysLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, identity, revision, token]);
  const workspace = workspaces.find((row) => row.id === workspaceId),
    key = keys.find((row) => row.id === keyId);
  useEffect(() => {
    onChange(
      !checking && !sessionError && workspace && key && session
        ? {
            workspace,
            keyId: key.id,
            keyName: key.name,
            canWrite: session.permissions.write,
          }
        : null,
    );
  }, [workspace, key, checking, sessionError, identity, onChange]);

  const distinctOrganizations =
    new Set(workspaces.map((row) => row.organization_name)).size > 1;

  if (checking) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          Checking your login…
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {sessionError ||
            description ||
            "Sign in to test requests with your workspace key. Your API key secret stays on the server."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm">
            <a href={docsLoginHref()}>Sign in to try the API</a>
          </Button>
          {sessionError && (
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry login check
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Workspace
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || loading || !workspaces.length}
                  className="max-w-56 justify-between gap-2 font-normal"
                  aria-label="API test workspace"
                >
                  <span className="truncate font-medium">
                    {loading
                      ? "Loading workspaces…"
                      : workspace
                        ? displayName(workspace.name, "Unnamed workspace")
                        : workspaces.length
                          ? "Choose workspace"
                          : "No workspaces"}
                  </span>
                  <IconChevronDown size={14} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                collisionPadding={8}
                align="start"
                className="max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={workspaceId}
                  onValueChange={(nextId) => {
                    disconnectedRef.current = false;
                    setDisconnected(false);
                    setWorkspaceId(nextId);
                    try {
                      window.localStorage.setItem(
                        "niu.active-workspace",
                        nextId,
                      );
                    } catch {
                      /* Storage is optional. */
                    }
                  }}
                >
                  {workspaces.map((row) => {
                    const wsName = displayName(row.name, "Unnamed workspace");
                    const orgName = displayName(
                      row.organization_name,
                      "Organization",
                    );
                    return (
                      <DropdownMenuRadioItem key={row.id} value={row.id}>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate font-medium">
                            {wsName}
                          </span>
                          {(distinctOrganizations || orgName !== wsName) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {orgName}
                            </span>
                          )}
                        </span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              API key
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled || !workspace || keysLoading || !keys.length}
                  className="max-w-56 justify-between gap-2 font-normal"
                  aria-label="API test key"
                >
                  <IconKey size={14} className="text-muted-foreground" />
                  <span className="truncate font-medium">
                    {keysLoading
                      ? "Loading keys…"
                      : key
                        ? displayName(key.name, "Unnamed API key")
                        : keys.length
                          ? "Choose API key"
                          : "No active keys"}
                  </span>
                  <IconChevronDown size={14} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                collisionPadding={8}
                align="start"
                className="max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto"
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Active API keys
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={keyId}
                  onValueChange={(nextKeyId) => {
                    disconnectedRef.current = false;
                    setDisconnected(false);
                    setKeyId(nextKeyId);
                  }}
                >
                  {keys.map((row) => (
                    <DropdownMenuRadioItem key={row.id} value={row.id}>
                      <span className="truncate">
                        {displayName(row.name, "Unnamed API key")}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              disabled={disabled || loading || keysLoading}
              onClick={() => {
                refresh();
                setRevision((value) => value + 1);
              }}
            >
              <IconRefresh size={14} />
              <span>Refresh access</span>
            </Button>
            {key && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                onClick={() => {
                  disconnectedRef.current = true;
                  setDisconnected(true);
                  setKeyId("");
                }}
              >
                <IconUnlink size={14} />
                <span>Disconnect reference</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {loading || keysLoading ? (
            <span role="status">Loading your configuration…</span>
          ) : !workspaces.length ? (
            <span>
              No accessible workspaces.{" "}
              <a
                href="/workspaces/default/"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Open dashboard
              </a>{" "}
              to configure access.
            </span>
          ) : workspace && !keys.length ? (
            <span>
              No active API keys in this workspace.{" "}
              <a
                href={
                  "/workspaces/" +
                  encodeURIComponent(workspace.route_slug) +
                  "/keys/"
                }
                className="font-medium text-foreground underline underline-offset-4"
              >
                Manage keys
              </a>
              .
            </span>
          ) : !session.permissions.write ? (
            <Badge variant="outline">
              Discovery only · write access required to execute requests
            </Badge>
          ) : key ? (
            <>
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <span
                  className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                Connected
              </Badge>
              {description && (
                <span className="hidden xl:inline">{description}</span>
              )}
            </>
          ) : (
            description && <span>{description}</span>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
