import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { applyLocale, readLocale } from './shell/locale';
import { createRouterContextProvider } from './shell/router-context';
import { applyTheme, readTheme } from './shell/theme';
import { mountDevelopmentApi } from './shell/dev-api-mount';

if (import.meta.env.DEV) mountDevelopmentApi(import.meta.env.BASE_URL);
applyTheme(readTheme());
applyLocale(readLocale());

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter getContext={createRouterContextProvider} useTransitions />
    </StrictMode>,
  );
});
