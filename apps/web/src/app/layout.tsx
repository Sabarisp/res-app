import './globals.css';

import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';

import { Providers } from '@/components/providers';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tavola - Restaurant System',
  description: 'Smart restaurant management, POS, KDS, and ordering flow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable}`}>
      <body className="antialiased font-sans bg-[var(--bg)] text-[var(--ink)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
