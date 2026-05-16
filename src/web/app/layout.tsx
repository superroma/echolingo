import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated Greek listening lessons',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
