// Gera os ícones do PWA a partir de UMA imagem mestra quadrada (>= 1024x1024).
//
// Uso:   node scripts/generate-pwa-icons.mjs <imagem-mestra.png> [pastaDeSaida] [prefixo]
// Padrão: pastaDeSaida = public/icons, prefixo = icon-v2
//
// Saídas (prefixo "icon-v2"):
//   icon-v2-192.png / icon-v2-512.png            purpose "any"
//   icon-v2-maskable-192.png / -512.png          purpose "maskable" (arte a 80% numa área segura; margem com a cor do canto)
//   apple-touch-icon-v2.png (180x180, opaco)     iOS (o sistema arredonda os cantos)
// Nomes versionados evitam que o cache do service worker e os apps já instalados sirvam o ícone antigo.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const [input, outDir = 'public/icons', prefix = 'icon-v2'] = process.argv.slice(2);
if (!input) {
  console.error('Informe a imagem mestra: node scripts/generate-pwa-icons.mjs <imagem.png> [pasta] [prefixo]');
  process.exit(1);
}

const meta = await sharp(input).metadata();
if (!meta.width || !meta.height || meta.width !== meta.height || meta.width < 512) {
  console.error(`A imagem mestra deve ser quadrada e ter pelo menos 512px (recebida: ${meta.width}x${meta.height}).`);
  process.exit(1);
}

// Cor do canto superior esquerdo: usada para preencher a margem dos ícones maskable e o fundo do iOS.
const { data } = await sharp(input).extract({ left: 2, top: 2, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };

await mkdir(outDir, { recursive: true });

async function any(size, file) {
  await sharp(input).resize(size, size, { fit: 'cover' }).png().toFile(join(outDir, file));
}

async function maskable(size, file) {
  const inner = Math.round(size * 0.8);
  const art = await sharp(input).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(join(outDir, file));
}

await any(192, `${prefix}-192.png`);
await any(512, `${prefix}-512.png`);
await maskable(192, `${prefix}-maskable-192.png`);
await maskable(512, `${prefix}-maskable-512.png`);
await sharp(input).resize(180, 180, { fit: 'cover' }).flatten({ background }).png().toFile(join(outDir, 'apple-touch-icon-v2.png'));

console.log(`Ícones gerados em ${outDir} (${prefix}-*.png e apple-touch-icon-v2.png).`);
