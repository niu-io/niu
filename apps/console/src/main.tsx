import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createConsoleRouter } from './app/routes';
import './styles.css';

import { applyTheme, readTheme } from './app/theme';

applyTheme(readTheme());
const router = createConsoleRouter();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
