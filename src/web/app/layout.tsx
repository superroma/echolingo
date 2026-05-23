import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Inter, Source_Serif_4 } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin', 'greek', 'cyrillic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated listening lessons',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            }
          `}
        </Script>
      </body>
    </html>
  );
}
