import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/auth.provider';
import { RepositoryProvider } from '@/providers/repository.provider';
import { AppShell } from '@/components/app-shell';
import { PwaRuntime } from '@/components/pwa/pwa-runtime';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Painel Pessoal Lucas',
  description: 'Central Operacional Pessoal',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Painel Lucas',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <AuthProvider>
          <RepositoryProvider>
            <AppShell>{children}</AppShell>
          </RepositoryProvider>
        </AuthProvider>
        <PwaRuntime />
      </body>
    </html>
  );
}
