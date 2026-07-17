import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { RepositoryProvider } from '@/providers/repository.provider';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { GlobalSearchModal } from '@/components/global-search-modal';
import { SidebarNav } from '@/components/sidebar-nav';

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
        <RepositoryProvider>
          <div className="flex h-dvh flex-col md:flex-row">
            <SidebarNav />
            <main className="flex-1 overflow-auto pt-14 md:pt-0">
              {children}
            </main>
          </div>
          <QuickCaptureModal />
          <GlobalSearchModal />
        </RepositoryProvider>
      </body>
    </html>
  );
}
