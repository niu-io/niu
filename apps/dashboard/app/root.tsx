import { RouterProvider } from 'react-router';
import { PlatformCurrencyProvider } from './shell/platform-currency';
import { BrandingProvider } from './shell/branding';
import { applyTheme, readTheme } from './shell/theme';
import { applyLocale, readLocale } from './shell/locale';
import { createDashboardRouter } from './routes';
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

export default function DashboardRoot() {
  return (
    <PlatformCurrencyProvider>
      <BrandingProvider>
        <RouterProvider router={getBrowserRouter()} useTransitions />
      </BrandingProvider>
    </PlatformCurrencyProvider>
  );
}
