import { Button } from "../../../dashboard/src/components/ui/button";
import { docsLoginHref, useDocsSession } from "./live-api/session";

/** Shared-origin session awareness; never reads or exposes the session cookie. */
export default function SessionLink() {
  const { session, checking, error, refresh } = useDocsSession();
  if (checking)
    return (
      <span className="text-sm text-muted-foreground" role="status">
        Checking login…
      </span>
    );
  if (error)
    return (
      <Button variant="ghost" size="sm" onClick={refresh}>
        Retry login check
      </Button>
    );
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="text-foreground no-underline"
    >
      <a href={session ? "/workspaces/default/" : docsLoginHref()}>
        {session ? "Dashboard" : "Sign in"}
      </a>
    </Button>
  );
}
