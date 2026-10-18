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
import { useLocale } from "../../../../dashboard/src/app/locale";
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
}: {
  onChange: (selection: DocsKeySelection | null) => void;
  disabled?: boolean;
  description?: string;
}) {
  const { t } = useLocale();
  const { session, checking, error: sessionError, refresh } = useDocsSession();
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
          );
        if (
          !Array.isArray(page.data) ||
          (page.next_cursor !== null &&
            (typeof page.next_cursor !== "string" ||
              seen.has(page.next_cursor)))
        )
          throw new Error(t("Workspace directory changed. Reload it.", "工作空间目录已更新，请重新加载。"));
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

  const distinctOrganizations =
    new Set(workspaces.map((row) => row.organization_name)).size > 1;

  if (checking) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted-foreground">
          {t("Checking your login…", "正在检查登录状态…")}
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
            t(
              "Sign in to test requests with your workspace key. Your API key secret stays on the server.",
              "登录即可使用工作空间密钥测试请求，API 密钥明文始终保存在服务端。",
            )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm">
            <a href={docsLoginHref()}>{t("Sign in to try the API", "登录以测试 API")}</a>
          </Button>
          {sessionError && (
            <Button variant="outline" size="sm" onClick={refresh}>
              {t("Retry login check", "重试登录检查")}
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
              {t("Workspace", "工作空间")}
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
                      ? t("Loading workspaces…", "正在加载工作空间…")
                      : workspace
                        ? displayName(workspace.name, t("Unnamed workspace", "未命名工作空间"))
                        : workspaces.length
                          ? t("Choose workspace", "选择工作空间")
                          : t("No workspaces", "暂无工作空间")}
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
                  {t("Workspaces", "工作空间")}
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
                    const wsName = displayName(row.name, t("Unnamed workspace", "未命名工作空间"));
                    const orgName = displayName(
                      row.organization_name,
                      t("Organization", "组织"),
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
              {t("API key", "API 密钥")}
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
                      ? t("Loading keys…", "正在加载密钥…")
                      : key
                        ? displayName(key.name, t("Unnamed API key", "未命名 API 密钥"))
                        : keys.length
                          ? t("Choose API key", "选择 API 密钥")
                          : t("No active keys", "暂无有效密钥")}
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
                  {t("Active API keys", "有效 API 密钥")}
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
                        {displayName(row.name, t("Unnamed API key", "未命名 API 密钥"))}
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
              <span>{t("Refresh access", "刷新权限")}</span>
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
                <span>{t("Disconnect reference", "断开连接")}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {loading || keysLoading ? (
            <span role="status">{t("Loading your configuration…", "正在加载配置…")}</span>
          ) : !workspaces.length ? (
            <span>
              {t("No accessible workspaces.", "暂无可访问的工作空间。")}{" "}
              <a
                href="/workspaces/default/"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {t("Open dashboard", "打开控制台")}
              </a>{" "}
              {t("to configure access.", "配置访问权限。")}
            </span>
          ) : workspace && !keys.length ? (
            <span>
              {t("No active API keys in this workspace.", "当前工作空间暂无有效 API 密钥。")}{" "}
              <a
                href={
                  "/workspaces/" +
                  encodeURIComponent(workspace.route_slug) +
                  "/keys/"
                }
                className="font-medium text-foreground underline underline-offset-4"
              >
                {t("Manage keys", "管理密钥")}
              </a>
              .
            </span>
          ) : !session.permissions.write ? (
            <Badge variant="outline">
              {t(
                "Discovery only · write access required to execute requests",
                "仅限查看 · 需要写入权限才能执行请求",
              )}
            </Badge>
          ) : key ? (
            <>
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <span
                  className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                {t("Connected", "已连接")}
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
