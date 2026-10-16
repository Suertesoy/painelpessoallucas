/**
 * Identidade do app em um só lugar. O tema visual atual (casinha vermelha com
 * uma estrela amarela) vem de branding/themes/casinha-vermelha.svg; para um
 * tema sazonal, crie outro SVG em branding/themes/ e rode
 * `node scripts/build-brand-assets.mjs branding/themes/<tema>.svg` — os PNGs
 * mantêm os mesmos nomes, então nada mais precisa mudar.
 */
export const BRAND = {
  appName: 'Lutheus',
  tagline: 'a nossa casa, em um só lugar',
  description: 'Compras, finanças, notas, estudos e treinos da nossa casa, em um só lugar.',
  themeId: 'casinha-vermelha',
  /** Cor da barra do sistema / splash (combina com o fundo escuro do app). */
  themeColor: '#0f141b',
  shareImage: { url: '/og/share.png', width: 1200, height: 630 },
} as const;
