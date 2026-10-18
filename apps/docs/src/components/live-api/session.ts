import { useEffect, useRef, useState } from "react";

export type DocsSession = {
  operator: {
    id: string;
    organization_id: string;
    project_id: string | null;
  } | null;
  permissions: { write: boolean };
  kind: string;
};
/** Browser cookies remain HttpOnly; this hook reads only the authorized session projection. */
export function useDocsSession(token?: string) {
  const [session, setSession] = useState<DocsSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const checked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!checked.current) setChecking(true);
    setError("");
    void fetch("/api/v1/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          if (!controller.signal.aborted) setSession(null);
          return;
        }
        if (!response.ok) throw new Error("Login status is unavailable.");
        const value = await response.json();
        if (!value.data?.permissions || !value.data?.kind)
          throw new Error("Login status is unavailable.");
        if (!controller.signal.aborted) setSession(value.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSession(null);
          setError("Could not check your login. Try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          checked.current = true;
          setChecking(false);
        }
      });
    return () => controller.abort();
  }, [revision, token]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return {
    session,
    checking,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
export function docsLoginHref() {
  const params = new URLSearchParams(window.location.search);
  let pathname = window.location.pathname;
  if (params.get("embed") === "help" && pathname.startsWith("/docs/")) {
    params.delete("embed");
    pathname = "/help/" + pathname.slice("/docs/".length);
  }
  const search = params.toString() ? `?${params.toString()}` : "";
  return (
    "/login?returnTo=" +
    encodeURIComponent(pathname + search + window.location.hash)
  );
}
/** Never substitute a routing identifier for a missing display label. */
export function displayName(value: string | undefined, fallback: string) {
  return value?.trim() &&
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)
    ? value
    : fallback;
}
export async function metadata<T>(
  path: string,
  signal: AbortSignal,
  token?: string,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your login expired. Sign in again."
        : response.status === 403
          ? "Your account cannot access this workspace."
          : "Could not load this configuration. Try again.",
    );
  return response.json() as Promise<T>;
}
