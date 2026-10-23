import React from 'react';
import { PlatformCurrencyProvider } from './app/platform-currency';
import { BrandingProvider } from './app/branding';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createDashboardRouter } from './app/routes';
import './styles.css';

import { applyTheme, readTheme } from './app/theme';

applyTheme(readTheme());
const router = createDashboardRouter();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlatformCurrencyProvider><BrandingProvider><RouterProvider router={router} /></BrandingProvider></PlatformCurrencyProvider>
  </React.StrictMode>,
);
