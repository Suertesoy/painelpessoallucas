// Gera a identidade visual do app (ícones PWA, ícone do iPhone, favicon e imagem
// de compartilhamento) a partir de UM tema em SVG. Trocar o tema sazonal =
// apontar para outro SVG e rodar de novo.
//
// Uso:  node scripts/build-brand-assets.mjs branding/themes/casinha-vermelha.svg [--name Lutheus] [--tagline "..."]
//
// Saídas (mesmos nomes de arquivo de antes, então manifest, service worker e
// metadados continuam apontando para os lugares certos):
//   public/icons/icon-192.png, icon-512.png            (purpose "any")
//   public/icons/icon-maskable-192.png, -512.png       (purpose "maskable", arte a 80%)
//   public/icons/apple-touch-icon.png                  (180x180, opaco; o iOS arredonda)
//   public/og/share.png                                (1200x630, link compartilhado)
//   src/app/favicon.ico                                (PNG 256 dentro de um .ico)
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const svgPath = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!svgPath) {
  console.error('Informe o tema: node scripts/build-brand-assets.mjs branding/themes/<tema>.svg');
  process.exit(1);
}
const appName = opt('name', 'Lutheus');
const tagline = opt('tagline', 'a nossa casa, em um só lugar');

const svg = await readFile(svgPath);
const render = (size) => sharp(svg, { density: Math.max(72, Math.round((size / 1024) * 72 * 4)) }).resize(size, size);

// Cor de fundo do tema (canto do ícone) para as margens do maskable e do iOS.
const { data } = await render(256).extract({ left: 2, top: 2, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };

await mkdir('public/icons', { recursive: true });
await mkdir('public/og', { recursive: true });

for (const size of [192, 512]) {
  await render(size).png().toFile(`public/icons/icon-${size}.png`);
  const inner = Math.round(size * 0.8);
  const art = await render(inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(`public/icons/icon-maskable-${size}.png`);
}
await render(180).flatten({ background }).png().toFile('public/icons/apple-touch-icon.png');

// favicon.ico com um PNG de 256px (formato ICO aceita PNG embutido).
const png256 = await render(256).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reservado
header.writeUInt16LE(1, 2); // tipo: ícone
header.writeUInt16LE(1, 4); // 1 imagem
header.writeUInt8(0, 6); // largura 256 => 0
header.writeUInt8(0, 7); // altura 256 => 0
header.writeUInt16LE(1, 10); // planos
header.writeUInt16LE(32, 12); // bits por pixel
header.writeUInt32LE(png256.length, 14);
header.writeUInt32LE(22, 18);
await writeFile('src/app/favicon.ico', Buffer.concat([header, png256]));

// Imagem de compartilhamento 1200x630: fundo do tema, ícone grande e nome.
const bg = '#FFE7D4';
// Ícone com cantos arredondados (como um "azulejo"), para não aparecer uma caixa quadrada sobre o fundo.
const rounded = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460"><rect width="460" height="460" rx="104" fill="#fff"/></svg>');
const iconBuf = await render(460).composite([{ input: rounded, blend: 'dest-in' }]).png().toBuffer();
const text = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
     <text x="640" y="320" font-family="Arial, Helvetica, sans-serif" font-size="128" font-weight="700" fill="#B71C25">${appName}</text>
     <text x="644" y="392" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#7A2A31">${tagline}</text>
   </svg>`
);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: bg } })
  .composite([
    { input: iconBuf, left: 110, top: 85 },
    { input: text, left: 0, top: 0 },
  ])
  .png()
  .toFile('public/og/share.png');

console.log(`Identidade "${appName}" gerada a partir de ${svgPath}.`);
