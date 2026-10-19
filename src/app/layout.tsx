import type { Metadata, Viewport } from 'next';
import { APP_INFO } from '@shared/app-info';
import './globals.css';

export const metadata: Metadata = {
  title: APP_INFO.brand,
  description: 'Bus ticketing for Cavite bus lines',
  applicationName: APP_INFO.softwareName,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'BRT', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f3d3e' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1416' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
