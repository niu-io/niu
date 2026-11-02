import type { ReactNode } from 'react';
import { Links, Meta, Outlet, RouterProvider, Scripts, ScrollRestoration } from 'react-router';
import { createDashboardRouter } from './router-tree';
import { BrandingProvider } from './shell/branding';
import { applyLocale, readLocale } from './shell/locale';
import { PlatformCurrencyProvider } from './shell/platform-currency';
import AppError from './shell/route-error';
import { DataRouterPresenceContext } from './shell/router-context';
import RouterPending from './shell/RouterPending';
import { applyTheme, readTheme } from './shell/theme';
import './styles.css';

let browserRouter: ReturnType<typeof createDashboardRouter> | undefined;

function getBrowserRouter() {
  if (!browserRouter) {
    applyTheme(readTheme());
    applyLocale(readLocale());
    browserRouter = createDashboardRouter();
  }
  return browserRouter;
}

function isFrameworkModeRuntime(): boolean {
  if (typeof window === 'undefined') return true;
  return '__reactRouterContext' in window;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#f6f7f9" />
        <link
          rel="icon"
          type="image/x-icon"
          href={`${import.meta.env.BASE_URL}assets/favicon.ico`}
          sizes="any"
        />
        <title>Niu</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={location => location.pathname} />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <PlatformCurrencyProvider>
      <BrandingProvider>
        <RouterPending />
      </BrandingProvider>
    </PlatformCurrencyProvider>
  );
}

export const ErrorBoundary = AppError;

export default function DashboardRoot() {
  if (isFrameworkModeRuntime()) {
    return (
      <DataRouterPresenceContext.Provider value={true}>
        <PlatformCurrencyProvider>
          <BrandingProvider>
            <Outlet />
          </BrandingProvider>
        </PlatformCurrencyProvider>
      </DataRouterPresenceContext.Provider>
    );
  }
  return (
    <PlatformCurrencyProvider>
      <BrandingProvider>
        <RouterProvider router={getBrowserRouter()} useTransitions />
      </BrandingProvider>
    </PlatformCurrencyProvider>
  );
}
