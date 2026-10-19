import { IconLayoutDashboard } from "@tabler/icons-react";
import { Button } from "../../../dashboard/src/components/ui/button";
/** Public navigation stays available; the dashboard owns authentication. */
export default function SessionLink() {
  return (
    <Button asChild size="sm" className="public-session-action no-underline">
      <a href="/workspaces/default/">
        <IconLayoutDashboard aria-hidden="true" />
        Dashboard
      </a>
    </Button>
  );
}
