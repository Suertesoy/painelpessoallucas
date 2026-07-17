import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/providers/auth.provider';
import { RepositoryProvider } from '@/providers/repository.provider';
import { AppShell } from '@/components/app-shell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Painel Pessoal Lucas',
  description: 'Central Operacional Pessoal',
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
      </body>
    </html>
  );
}
