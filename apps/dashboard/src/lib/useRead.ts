import { useEffect, useState } from 'react';

export function useRead<T>(token: string, path: string | null) {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string }>({ path: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ path });
    if (path) void fetch(path, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(`Unable to load records (${response.status}).`); return response.json() as Promise<T>; })
      .then(data => { if (!controller.signal.aborted) setState({ path, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ path, error: error.message }); });
    return () => controller.abort();
  }, [token, path]);
  return state.path === path ? state : { path };
}

