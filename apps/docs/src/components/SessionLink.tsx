import { IconLayoutDashboard } from "@tabler/icons-react";
import { Button } from "../../../dashboard/src/components/ui/button";
import { docsLoginHref, useDocsSession } from "./live-api/session";
import { useLocale } from "../../../dashboard/src/app/locale";

/** Shared-origin session awareness; never reads or exposes the session cookie. */
export default function SessionLink() {
  const { session, checking, error, refresh } = useDocsSession();
  const { t } = useLocale();
  if (checking)
    return (
      <span className="text-sm text-muted-foreground" role="status">
        {t("Checking login…", "正在检查登录状态…")}
      </span>
    );
  if (error)
    return (
      <Button variant="ghost" size="sm" onClick={refresh}>
        {t("Retry login check", "重试登录检查")}
      </Button>
    );
  return (
    <Button asChild size="sm" className="public-session-action no-underline">
      <a href={session ? "/workspaces/default/" : docsLoginHref()}>
        {session && <IconLayoutDashboard aria-hidden="true" />}
        {session ? t("Dashboard", "控制台") : t("Sign in", "登录")}
      </a>
    </Button>
  );
}
