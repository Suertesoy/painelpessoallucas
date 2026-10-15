import { normalizeText } from '@/modules/finance/domain/normalize-text';

/**
 * Categoria (natureza do gasto) e finalidade (pessoal/doméstico/profissional)
 * dos lançamentos de fatura. São duas informações independentes e NENHUMA
 * delas altera valores nem a conciliação: classificar é só rotular.
 *
 * Esta lista é do domínio de FATURAS e não se mistura com as categorias do
 * módulo antigo de transações (`finance_categories`).
 */

export const CATEGORIES = [
  { id: 'ai', label: 'Inteligência artificial', tech: true },
  { id: 'infrastructure', label: 'Infraestrutura digital', tech: true },
  { id: 'software', label: 'Software e serviços', tech: true },
  { id: 'subscriptions', label: 'Assinaturas e aplicativos', tech: false },
  { id: 'streaming', label: 'Streaming', tech: false },
  { id: 'groceries', label: 'Mercado', tech: false },
  { id: 'restaurants', label: 'Restaurantes e delivery', tech: false },
  { id: 'transport', label: 'Transporte', tech: false },
  { id: 'travel', label: 'Viagens', tech: false },
  { id: 'health', label: 'Saúde', tech: false },
  { id: 'shopping', label: 'Compras online', tech: false },
  { id: 'leisure', label: 'Lazer', tech: false },
  { id: 'housing', label: 'Moradia e contas', tech: false },
  { id: 'other', label: 'Outros', tech: false },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const PURPOSES = [
  { id: 'personal', label: 'Pessoal' },
  { id: 'household', label: 'Doméstico' },
  { id: 'professional', label: 'Profissional' },
] as const;

export type PurposeId = (typeof PURPOSES)[number]['id'];

const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);
const PURPOSE_IDS: readonly string[] = PURPOSES.map((p) => p.id);

export const isCategoryId = (v: unknown): v is CategoryId => typeof v === 'string' && CATEGORY_IDS.includes(v);
export const isPurposeId = (v: unknown): v is PurposeId => typeof v === 'string' && PURPOSE_IDS.includes(v);

export function categoryLabel(id: string | null): string {
  if (!id) return 'Sem categoria';
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function purposeLabel(id: string | null): string {
  if (!id) return 'Não classificada';
  return PURPOSES.find((p) => p.id === id)?.label ?? id;
}

/** Categorias de tecnologia (IA, infraestrutura, software e serviços). */
export function isTechCategory(id: string | null): boolean {
  return CATEGORIES.some((c) => c.id === id && c.tech);
}

/** "Tecnologia e profissional": categoria de tecnologia OU finalidade profissional. */
export function isTechOrProfessional(item: { category: string | null; purpose: string | null }): boolean {
  return isTechCategory(item.category) || item.purpose === 'professional';
}

/** Serviços de streaming (vídeo, música). Também usados na leitura de itens antigos 'subscriptions'. */
export const STREAMING_KEYWORDS = ['netflix', 'spotify', 'amazonprime', 'amazon prime', 'prime video', 'disney', 'hbo', 'youtube', 'globoplay', 'deezer', 'paramount', 'max.com', 'apple tv', 'crunchyroll'];

/**
 * Palavras-chave por categoria. São apenas SUGESTÕES (o usuário aceita ou
 * altera); nunca definem a classificação sozinhas. Estabelecimentos sem
 * regra clara (ex.: "Apple.Com/Bill") ficam sem sugestão — "a confirmar".
 */
const KEYWORD_RULES: { category: CategoryId; keywords: string[] }[] = [
  { category: 'infrastructure', keywords: ['vercel', 'github', 'cloudflare', 'supabase', 'digitalocean', 'hostinger', 'godaddy', 'namecheap', 'railway', 'netlify', 'amazon web', 'aws', 'registro br', 'hostgator'] },
  { category: 'ai', keywords: ['openai', 'chatgpt', 'anthropic', 'claude', 'magnific', 'midjourney', 'cursor', 'runway', 'elevenlabs', 'perplexity', 'gemini', 'copilot', 'g1ai'] },
  { category: 'software', keywords: ['google one', 'workana', 'adobe', 'figma', 'notion', 'canva', 'dropbox', 'microsoft', 'zoom', 'slack', 'jetbrains', 'icloud'] },
  { category: 'streaming', keywords: STREAMING_KEYWORDS },
  { category: 'leisure', keywords: ['cinema', 'cinemark', 'ingresso', 'ticketmaster', 'sympla', 'steam', 'playstation', 'xbox', 'nintendo', 'boliche', 'teatro'] },
  // Compras online vem antes de Mercado: "mercadolivre" contém "mercado".
  { category: 'shopping', keywords: ['mercadolivre', 'mercado livre', 'amazonmktplc', 'magalu', 'shopee', 'havan', 'americanas', 'kabum', 'aliexpress', 'shein'] },
  { category: 'restaurants', keywords: ['ifood', 'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'mcdonald', 'burger', 'cafeteria', 'sorveteria', 'rappi'] },
  { category: 'groceries', keywords: ['mercado', 'supermercado', 'padaria', 'atacad', 'hortifruti', 'acougue', 'carrefour', 'assai', 'saralua', 'imperatr'] },
  { category: 'transport', keywords: ['uber', '99app', '99 ', 'posto', 'shell', 'ipiranga', 'estacionamento', 'pedagio', 'sem parar', 'conectcar'] },
  { category: 'travel', keywords: ['hotel', 'airbnb', 'booking', 'latam', 'azul linhas', 'gol linhas', 'aeroporto', 'decolar', 'cvc'] },
  { category: 'health', keywords: ['drogaria', 'farmacia', 'drogasil', 'raia', 'pague menos', 'hospital', 'clinica', 'laboratorio', 'odonto'] },
  { category: 'housing', keywords: ['enel', 'sabesp', 'condominio', 'aluguel', 'seguro', 'claro', 'vivo', 'tim ', 'internet'] },
];

export type SuggestionSource = 'history' | 'rule';

export interface ClassificationSuggestion {
  category: CategoryId | null;
  purpose: PurposeId | null;
  source: SuggestionSource;
}

export interface ClassifiableItem {
  id: string;
  /** Descrição normalizada da COMPRA (sem sufixo de parcela). */
  key: string;
  category: string | null;
  purpose: string | null;
}

/** Chave de comparação do estabelecimento: descrição-base normalizada. */
export function merchantKey(baseDescription: string): string {
  return normalizeText(baseDescription);
}

function ruleCategory(key: string): CategoryId | null {
  const padded = ` ${key} `;
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => padded.includes(k.length <= 3 ? ` ${k.trim()} ` : k.trim()))) return rule.category;
  }
  return null;
}

/**
 * Sugestão para um lançamento ainda sem classificação:
 *  1. HISTÓRICO — o que você já confirmou para o mesmo estabelecimento (só
 *     se for consistente; se houver conflito, não sugere).
 *  2. REGRA — palavra-chave da descrição (só categoria; finalidade nunca é
 *     presumida por regra).
 */
export function suggestClassification(
  item: Pick<ClassifiableItem, 'key' | 'category' | 'purpose'>,
  all: readonly ClassifiableItem[]
): ClassificationSuggestion | null {
  const missingCategory = item.category === null;
  const missingPurpose = item.purpose === null;
  if (!missingCategory && !missingPurpose) return null;

  const peers = all.filter((o) => o.key === item.key && (o.category !== null || o.purpose !== null));
  const categories = new Set(peers.map((p) => p.category).filter((c): c is string => c !== null));
  const purposes = new Set(peers.map((p) => p.purpose).filter((c): c is string => c !== null));
  const histCategory = missingCategory && categories.size === 1 ? [...categories][0] : null;
  const histPurpose = missingPurpose && purposes.size === 1 ? [...purposes][0] : null;

  if (isCategoryId(histCategory) || isPurposeId(histPurpose)) {
    return {
      category: isCategoryId(histCategory) ? histCategory : null,
      purpose: isPurposeId(histPurpose) ? histPurpose : null,
      source: 'history',
    };
  }
  if (missingCategory) {
    const rule = ruleCategory(item.key);
    if (rule) return { category: rule, purpose: null, source: 'rule' };
  }
  return null;
}
