import { IconLayoutDashboard } from "@tabler/icons-react";
import { Button } from "../../../dashboard/src/components/ui/button";
import { useLocale } from "../../../dashboard/src/app/locale";

/** Public navigation stays available; the dashboard owns authentication. */
export default function SessionLink() {
  const { t } = useLocale();
  return (
    <Button asChild size="sm" className="public-session-action no-underline">
      <a href="/workspaces/default/">
        <IconLayoutDashboard aria-hidden="true" />
        {t("Dashboard", "控制台")}
      </a>
    </Button>
  );
}
