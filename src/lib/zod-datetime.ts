import { z } from 'zod';

/**
 * Validação Zod para timestamps vindos do Postgres/PostgREST.
 *
 * O Postgres serializa `timestamptz` em JSON com offset numérico
 * (`+00:00`), nunca com o sufixo literal `Z` — é a saída padrão de
 * `to_json`/`row_to_json`, o mesmo mecanismo que o PostgREST usa para
 * montar a resposta. `z.string().datetime()` sem `{ offset: true }` exige
 * exatamente `Z` e rejeita esse formato — isso derrubava a coleção inteira
 * (o primeiro registro incompatível interrompia todo o `.map()` do mapper).
 *
 * Aceita tanto `+00:00` (dados remotos) quanto `Z` (ex.: dados gravados
 * localmente via `new Date().toISOString()`, como no backup da Fase 1).
 */
export const isoDateTimeSchema = z.string().datetime({ offset: true });
