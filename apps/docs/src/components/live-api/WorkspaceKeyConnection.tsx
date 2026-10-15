import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "../../../../dashboard/src/components/ui/button";
import { Label } from "../../../../dashboard/src/components/ui/label";
import {
  Alert,
  AlertDescription,
} from "../../../../dashboard/src/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
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
}: {
  onChange: (selection: DocsKeySelection | null) => void;
  disabled?: boolean;
}) {
  const { session, checking, error: sessionError, refresh } = useDocsSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyId, setKeyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const identity = session
    ? JSON.stringify([session.kind, session.operator, session.permissions])
    : "";
  useEffect(() => {
    const controller = new AbortController();
    setWorkspaces([]);
    setWorkspaceId("");
    setKeys([]);
    setKeyId("");
    setError("");
    setLoading(false);
    if (!identity) return;
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
        if (rows.length === 1) setWorkspaceId(rows[0]!.id);
      }
    })()
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [identity, revision]);
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
    )
      .then((page) => {
        if (!controller.signal.aborted)
          setKeys(page.data.filter((key) => !key.revoked && !key.expired));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setKeysLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, identity, revision]);
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
  if (checking) return <p role="status">Checking your login…</p>;
  if (!session)
    return (
      <div className="flex flex-col gap-3">
        <p>
          {sessionError ||
            "Sign in to test requests with your own workspace. Your API key stays on the server."}
        </p>
        <Button asChild>
          <a href={docsLoginHref()}>Sign in to try the API</a>
        </Button>
        {sessionError && (
          <Button variant="outline" onClick={refresh}>
            Retry login check
          </Button>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex flex-col gap-2">
          <Label>Workspace</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={disabled || loading}
                className="max-w-full"
                aria-label="API test workspace"
              >
                <span className="truncate">
                  {workspace
                    ? displayName(workspace.name, "Unnamed workspace")
                    : "Choose workspace"}
                </span>
                <IconChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              collisionPadding={8}
              align="start"
              className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
            >
              <DropdownMenuRadioGroup
                value={workspaceId}
                onValueChange={setWorkspaceId}
              >
                {workspaces.map((row) => (
                  <DropdownMenuRadioItem key={row.id} value={row.id}>
                    <span className="break-words">
                      {displayName(row.name, "Unnamed workspace")}
                      <span className="block text-xs text-muted-foreground">
                        {displayName(row.organization_name, "Company")} ·
                        Created {new Date(row.created_at_ms).toLocaleString()}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-w-0 flex flex-col gap-2">
          <Label>API key</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={disabled || !workspace || keysLoading}
                className="max-w-full"
                aria-label="API test key"
              >
                <span className="truncate">
                  {key
                    ? displayName(key.name, "Unnamed API key")
                    : "Choose API key"}
                </span>
                <IconChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              collisionPadding={8}
              align="start"
              className="max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
            >
              <DropdownMenuRadioGroup value={keyId} onValueChange={setKeyId}>
                {keys.map((row) => (
                  <DropdownMenuRadioItem key={row.id} value={row.id}>
                    {displayName(row.name, "Unnamed API key")}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="ghost"
          disabled={disabled || loading || keysLoading}
          onClick={() => {
            refresh();
            setRevision((value) => value + 1);
          }}
        >
          Refresh access
        </Button>
      </div>
      {(loading || keysLoading) && (
        <p role="status">Loading your configuration…</p>
      )}
      {!loading && !workspaces.length && (
        <p>
          No accessible workspaces.{" "}
          <a href="/workspaces/default/">Open dashboard</a> to configure access.
        </p>
      )}
      {workspace && !keysLoading && !keys.length && (
        <p>
          No active API keys in this workspace.{" "}
          <a
            href={
              "/workspaces/" +
              encodeURIComponent(workspace.route_slug) +
              "/keys/"
            }
          >
            Manage keys
          </a>
          .
        </p>
      )}
      {!session.permissions.write && (
        <p>
          Your role allows discovery only. Request execution requires workspace
          write access.
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
