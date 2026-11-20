import { attachRouteImporter, type LazyRouteModule } from './prefetch';
import type { RouteHandle } from './router-context';

export function bindLazy(load: () => Promise<LazyRouteModule>, handle?: RouteHandle) {
  return attachRouteImporter(async () => {
    const mod = await load();
    if (mod.loader && mod.clientLoader) {
      throw new Error('Route module cannot export both loader and clientLoader.');
    }
    // Data Mode has no server boundary: run a client action in the action slot
    // just as clientLoader is already bound to loader above. Framework SPA
    // routes consume the clientAction export directly.
    const action = mod.action ?? mod.clientAction;
    return {
      Component: mod.default,
      ...(mod.ErrorBoundary ? { ErrorBoundary: mod.ErrorBoundary } : {}),
      ...(mod.HydrateFallback ? { HydrateFallback: mod.HydrateFallback } : {}),
      ...(mod.loader ? { loader: mod.loader } : {}),
      ...(mod.clientLoader ? { loader: mod.clientLoader } : {}),
      ...(action ? { action } : {}),
      ...(mod.clientAction ? { clientAction: mod.clientAction } : {}),
      ...(mod.shouldRevalidate ? { shouldRevalidate: mod.shouldRevalidate } : {}),
      ...(mod.handle || handle ? { handle: { ...handle, ...mod.handle } } : {}),
    };
  }, load);
}
