/**
 * File:        web/app/root.tsx
 * Module:      App · Root Layout
 * Purpose:     Remix root layout with Shopify Polaris setup
 *
 * Exports:
 *   - App — Root component with Polaris provider
 *   - links — Global styles
 *   - meta — Page metadata
 *
 * Depends on:
 *   - @shopify/polaris — Shopify UI components
 *   - @shopify/app-bridge — Shopify app bridge
 *   - @remix-run/node — Server utilities
 *
 * Side-effects:
 *   - Initializes Shopify app bridge
 *   - Sets up Polaris translations
 *
 * Key invariants:
 *   - All routes wrapped in AppProvider
 *   - Polaris CSS imported globally
 *
 * Author:      UGC Boost Team
 * Last-updated: 2026-05-12
 */

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/node';
import {
  AppProvider,
  Link as PolarisLink,
  Routes,
  Title,
} from '@shopify/polaris';
import { useCallback, useState } from 'react';
import { AppBridgeProvider } from './components/AppBridgeProvider';
import { HotjarProvider } from './components/HotjarProvider';

// Global styles
import '@shopify/polaris/build/esm/styles.css';
import './styles/global.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [ Polarisrules, setPolarisrules ] = useState<string[]>([]);

  // Update rules for Polaris
  const updateTranslations = useCallback((rules: string[]) => {
    setPolarisrules(rules);
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Title>UGC Boost</Title>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider
          i18n={{
            locale: 'en',
            translations: {},
          }}
        >
          <AppBridgeProvider>
            <HotjarProvider>
              <Outlet />
            </HotjarProvider>
          </AppBridgeProvider>
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Title>Error - UGC Boost</Title>
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={{ locale: 'en', translations: {} }}>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h1>Something went wrong</h1>
            <p>We apologize for the inconvenience. Please try again later.</p>
            <a href="/">Return to Dashboard</a>
          </div>
        </AppProvider>
        <Scripts />
      </body>
    </html>
  );
}

export const meta = () => {
  return [
    { title: 'UGC Boost - AI-Powered Social Proof' },
    { name: 'description', content: 'Automatically find, curate, and display customer photos on your store' },
  ];
};