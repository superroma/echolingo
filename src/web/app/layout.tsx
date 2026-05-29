import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { IBM_Plex_Sans, Literata } from 'next/font/google';
import { InstallPanel } from '../components/install-panel';

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated listening echoes',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var t = localStorage.getItem('echolingo:theme');
              if (t === 'light' || t === 'dark') {
                document.documentElement.classList.add('theme-' + t);
              }
            } catch (e) {}
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
        <InstallPanel />
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => {
                  // Check for new service worker on every visit
                  reg.update().catch(() => {});
                  // When a new SW takes control, reload to pick up fresh chunks
                  let reloaded = false;
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (reloaded) return;
                    reloaded = true;
                    window.location.reload();
                  });
                })
                .catch(() => {});
            }
          `}
        </Script>
      </body>
    </html>
  );
}
