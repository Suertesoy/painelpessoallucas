import Link from 'next/link';
import { Dumbbell, ShoppingCart, StickyNote, Wallet, type LucideIcon } from 'lucide-react';
import { HomeTopBar } from '@/components/home-top-bar';

/**
 * Nossa casa — o centro do app. Cada cartão é um ambiente que se visita:
 * entra-se, usa-se, volta-se para cá. Composição assimétrica de propósito
 * (tamanhos diferentes, leve profundidade), sem indicadores nem números.
 */

interface Room {
  href: string;
  title: string;
  hint: string;
  tint: string; // "H S% L%"
  layout: string; // classes de grade
  icon?: LucideIcon;
  glyph?: string;
}

const ROOMS: Room[] = [
  { href: '/compras', title: 'Compras', hint: 'O que falta em casa', tint: '160 55% 48%', layout: 'col-span-2 min-h-36', icon: ShoppingCart },
  { href: '/financas', title: 'Finanças', hint: 'Quanto temos e para onde vai', tint: '210 70% 60%', layout: 'row-span-2 min-h-64', icon: Wallet },
  { href: '/notas', title: 'Notas', hint: 'Lembretes e textos', tint: '35 85% 58%', layout: 'min-h-32', icon: StickyNote },
  { href: '/aprendizado', title: 'Estudos', hint: 'Japonês, no seu ritmo', tint: '265 70% 74%', layout: 'min-h-32', glyph: 'あ' },
  { href: '/treinos', title: 'Treinos', hint: 'A–E, cargas e descanso', tint: '18 85% 62%', layout: 'col-span-2 min-h-32', icon: Dumbbell },
];

export default function Home() {
  return (
    <div
      className="min-h-full"
      style={{ backgroundImage: 'radial-gradient(60rem 24rem at 50% -8rem, color-mix(in srgb, var(--accent) 14%, transparent), transparent)' }}
    >
      <div className="mx-auto max-w-xl px-4 pb-16 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-10">
        <HomeTopBar />

        {/* Sem título visível: os cartões são o foco. O h1 fica só para leitores de tela. */}
        <h1 className="sr-only">Lutheus</h1>

        <nav aria-label="Áreas da casa" className="mt-3 grid grid-cols-2 gap-3 md:gap-4">
          {ROOMS.map(({ href, title, hint, tint, layout, icon: Icon, glyph }, index) => (
            <Link
              key={href}
              href={href}
              style={{
                animationDelay: `${index * 60}ms`,
                background: `linear-gradient(155deg, hsl(${tint} / 0.16), var(--surface) 62%)`,
              }}
              className={`house-rise group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] border border-[var(--line)] p-5 shadow-[0_14px_30px_-16px_rgba(0,0,0,0.75)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--line-strong)] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${layout}`}
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-semibold"
                style={{ background: `hsl(${tint} / 0.2)`, color: `hsl(${tint})` }}
              >
                {Icon ? <Icon size={26} strokeWidth={1.75} /> : glyph}
              </span>
              <span className="mt-6 block">
                <span className="block text-2xl font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">{hint}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
