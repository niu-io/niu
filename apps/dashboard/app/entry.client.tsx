import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { applyLocale, readLocale } from './shell/locale';
import { createRouterContextProvider } from './shell/router-context';
import { applyTheme, readTheme } from './shell/theme';

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
