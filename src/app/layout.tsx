import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import './globals.css';
import { RepositoryProvider } from '@/providers/repository.provider';

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
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased flex h-screen`}>
        <RepositoryProvider>
          {/* Futura Sidebar / Navigation */}
          <aside className="w-64 bg-white border-r h-full flex flex-col p-4 space-y-2">
             <div className="font-bold text-xl mb-6">Painel Lucas</div>
             <Link href="/hoje" className="p-2 hover:bg-gray-100 rounded">Hoje</Link>
             <Link href="/entrada" className="p-2 hover:bg-gray-100 rounded">Caixa de Entrada</Link>
             <Link href="/projetos" className="p-2 hover:bg-gray-100 rounded">Projetos</Link>
             <Link href="/ideias" className="p-2 hover:bg-gray-100 rounded">Ideias e Insights</Link>
             <Link href="/agenda" className="p-2 hover:bg-gray-100 rounded">Agenda</Link>
             <Link href="/revisao" className="p-2 hover:bg-gray-100 rounded">Revisão</Link>
          </aside>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </RepositoryProvider>
      </body>
    </html>
  );
}
