import Link from 'next/link';
import { ShoppingCart, StickyNote, Wallet, type LucideIcon } from 'lucide-react';

/**
 * Nossa casa — porta de entrada. Sem indicadores, gráficos ou notificações:
 * só os três lugares que Lucas e Matheus usam todo dia.
 */

const AREAS: { href: string; title: string; hint: string; icon: LucideIcon; tint: string }[] = [
  { href: '/compras', title: 'Compras', hint: 'O que falta em casa', icon: ShoppingCart, tint: '160 55% 48%' },
  { href: '/financas', title: 'Finanças', hint: 'Quanto temos e para onde vai', icon: Wallet, tint: '210 70% 60%' },
  { href: '/notas', title: 'Notas', hint: 'Lembretes e textos livres', icon: StickyNote, tint: '35 85% 58%' },
];

export default function Home() {
  return (
    <div
      className="min-h-full"
      style={{ backgroundImage: 'radial-gradient(60rem 24rem at 50% -8rem, color-mix(in srgb, var(--accent) 14%, transparent), transparent)' }}
    >
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-10 md:px-8 md:pt-16">
        <header>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Nossa casa</h1>
          <p className="mt-3 text-lg text-[var(--text-muted)]">Uma central simples para organizar o dia a dia.</p>
        </header>

        <nav aria-label="Áreas da casa" className="mt-10 grid gap-4">
          {AREAS.map(({ href, title, hint, icon: Icon, tint }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-28 items-center gap-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] transition hover:border-[var(--line-strong)] active:scale-[0.99] md:p-6"
            >
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: `hsl(${tint} / 0.16)`, color: `hsl(${tint})` }}
              >
                <Icon size={30} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-semibold">{title}</span>
                <span className="mt-1 block text-base text-[var(--text-muted)]">{hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
