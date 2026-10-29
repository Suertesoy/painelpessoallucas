import { merchantKey } from './categories';
import { isAmbiguousMerchant, type CategoryRule } from './category-rules';

/**
 * Aprendizado automático de categorias a partir das escolhas do usuário.
 *
 * Função pura: recebe os lançamentos categorizados e as regras atuais e devolve
 * o que criar/ajustar/remover. Reaproveita `finance_category_rules`; o usuário
 * escolhe a categoria UMA vez e nunca precisa marcar "usar em semelhantes".
 *
 * Evidência = escolha CONFIRMADA (category_source 'user' ou legada sem origem).
 * Categoria aplicada por regra não é evidência (seria circular).
 *
 *  - Estabelecimento comum com histórico consistente em UMA categoria:
 *    regra para qualquer valor.
 *  - Intermediador/marketplace (Apple, Amazon, Mercado Pago...): só regra de
 *    estabelecimento + valor exato, e só se aquele valor for consistente.
 *  - Categorias conflitantes no mesmo estabelecimento: nenhuma regra ampla;
 *    sobra a sugestão (e regras de valor exato consistentes).
 *  - Correção de uma classificação automática: a regra ampla que contradiz a
 *    escolha confirmada é removida (itens que ela aplicou ficam como estão).
 *  - Nunca altera categoria já confirmada; nunca sobrescreve regra existente
 *    compatível com a evidência.
 */

export interface LearnableItem {
  id: string;
  baseDescription: string;
  amountCents: number;
  category: string | null;
  categorySource: 'user' | 'rule' | null;
  categoryRuleId: string | null;
}

export interface LearningPlan {
  create: { merchantKey: string; amountCents: number | null; category: string }[];
  /** Regra de valor exato cuja categoria contradiz a escolha confirmada. */
  retarget: { ruleId: string; category: string }[];
  /** Regras amplas contraditas por uma escolha confirmada. */
  remove: string[];
}

export function planLearning(items: readonly LearnableItem[], rules: readonly CategoryRule[], validCategoryIds: ReadonlySet<string>): LearningPlan {
  const plan: LearningPlan = { create: [], retarget: [], remove: [] };

  // 1) Regras amplas contraditas por escolha confirmada: removidas; os itens que
  // elas aplicaram passam a valer como confirmados (a contradição fica registrada).
  const confirmedByKey = (removed: ReadonlySet<string>) => {
    const map = new Map<string, LearnableItem[]>();
    for (const it of items) {
      if (!it.category) continue;
      const confirmed = it.categorySource !== 'rule' || (it.categoryRuleId !== null && removed.has(it.categoryRuleId));
      if (!confirmed) continue;
      const k = merchantKey(it.baseDescription);
      map.set(k, [...(map.get(k) ?? []), it]);
    }
    return map;
  };

  const userOnly = confirmedByKey(new Set());
  const removed = new Set<string>();
  for (const rule of rules) {
    if (rule.amountCents !== null) continue;
    const conflict = (userOnly.get(rule.merchantKey) ?? []).some((it) => it.category !== rule.category);
    if (conflict) removed.add(rule.id);
  }
  plan.remove = [...removed];

  const confirmed = confirmedByKey(removed);
  const liveRules = rules.filter((r) => !removed.has(r.id));

  for (const [key, list] of confirmed) {
    const categories = new Set(list.map((i) => i.category as string));
    const hasBroad = liveRules.some((r) => r.merchantKey === key && r.amountCents === null);

    if (!hasBroad && categories.size === 1 && !isAmbiguousMerchant(key)) {
      const category = [...categories][0];
      if (validCategoryIds.has(category)) {
        plan.create.push({ merchantKey: key, amountCents: null, category });
        // Regra de valor exato que diverge da escolha confirmada acompanha a correção.
        for (const r of liveRules) {
          if (r.merchantKey === key && r.amountCents !== null && r.category !== category) plan.retarget.push({ ruleId: r.id, category });
        }
        continue; // a regra ampla já cobre os valores
      }
    }
    if (hasBroad) continue;

    // Estabelecimento ambíguo ou conflitante: aprende por valor exato, só se consistente.
    const byAmount = new Map<number, Set<string>>();
    for (const it of list) byAmount.set(it.amountCents, (byAmount.get(it.amountCents) ?? new Set()).add(it.category as string));
    for (const [amount, cats] of byAmount) {
      if (cats.size !== 1) continue;
      const category = [...cats][0];
      if (!validCategoryIds.has(category)) continue;
      const existing = liveRules.find((r) => r.merchantKey === key && r.amountCents === amount);
      if (!existing) plan.create.push({ merchantKey: key, amountCents: amount, category });
      else if (existing.category !== category) plan.retarget.push({ ruleId: existing.id, category });
    }
  }
  return plan;
}
