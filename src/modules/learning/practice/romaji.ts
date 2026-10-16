/**
 * Normalização de romaji para respostas digitadas. Aceita as grafias comuns
 * de quem digita sem pensar em Hepburn estrito (si/shi, ti/chi, tu/tsu,
 * hu/fu, zi/ji, sya/sha…), ignora maiúsculas, espaços, hífens e macrons.
 */

export function normalizeRomaji(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s\-'’.,!?]/g, '');
}

/** Converte variações Kunrei/Nihon-shiki para a grafia Hepburn usada nas lições. */
export function canonicalRomaji(input: string): string {
  return normalizeRomaji(input)
    .replace(/(?<![sc])hu/g, 'fu')
    .replace(/sy([aueo])/g, 'sh$1')
    .replace(/ty([aueo])/g, 'ch$1')
    .replace(/cy([aueo])/g, 'ch$1')
    .replace(/(?:zy|jy)([aueo])/g, 'j$1')
    .replace(/si/g, 'shi')
    .replace(/ti/g, 'chi')
    .replace(/tu/g, 'tsu')
    .replace(/zi/g, 'ji')
    .replace(/di/g, 'ji')
    .replace(/du/g, 'zu');
}

/** Respostas extras aceitas para kana com mais de uma leitura "de teclado". */
const EXTRA_ACCEPTED: Record<string, string[]> = {
  を: ['wo', 'o'],
  ん: ['n', 'nn'],
  ぢ: ['ji', 'di', 'dji'],
  づ: ['zu', 'du', 'dzu'],
  は: ['ha'],
  へ: ['he'],
};

export function acceptedRomajiFor(character: string, romaji: string): string[] {
  return [romaji, ...(EXTRA_ACCEPTED[character] ?? [])];
}

export function isRomajiAnswerCorrect(answer: string, accepted: string[]): boolean {
  const given = canonicalRomaji(answer);
  if (!given) return false;
  return accepted.some((candidate) => canonicalRomaji(candidate) === given);
}
