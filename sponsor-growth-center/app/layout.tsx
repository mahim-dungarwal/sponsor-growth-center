import './globals.css';
import type { Metadata } from 'next';
import { AppStateProvider } from '@/components/AppState';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Sponsor Growth Center · CampusFest',
  description: 'Analytics, campaign management and an AI copilot for festival sponsorship growth.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppStateProvider>
          <Shell>{children}</Shell>
        </AppStateProvider>
      </body>
    </html>
  );
}
