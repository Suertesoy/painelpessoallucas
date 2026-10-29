// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { planLearning, type LearnableItem } from '@/modules/finance/cash/domain/category-learning-policy';
import { isAmbiguousMerchant, type CategoryRule } from '@/modules/finance/cash/domain/category-rules';

const valid = new Set(['groceries', 'restaurants', 'shopping', 'streaming', 'leisure']);
let n = 0;
const it_ = (desc: string, amount: number, category: string | null, source: 'user' | 'rule' | null = 'user', ruleId: string | null = null): LearnableItem => ({
  id: `i${n++}`, baseDescription: desc, amountCents: amount, category, categorySource: source, categoryRuleId: ruleId,
});

describe('política de aprendizado de categorias', () => {
  it('estabelecimento recorrente com uma categoria consistente: regra ampla', () => {
    const plan = planLearning([it_('Padaria Central', 1200, 'groceries'), it_('Padaria Central', 3400, 'groceries')], [], valid);
    expect(plan.create).toEqual([{ merchantKey: 'padaria central', amountCents: null, category: 'groceries' }]);
  });

  it('valores diferentes no mesmo estabelecimento comum seguem a mesma regra ampla', () => {
    const plan = planLearning([it_('Posto Shell', 15000, 'leisure')], [], valid);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].amountCents).toBeNull();
  });

  it('nomes normalizados: caixa e acento não separam o estabelecimento', () => {
    const plan = planLearning([it_('PADARIA  Pão Quente', 1000, 'groceries'), it_('padaria pao quente', 1500, 'groceries')], [], valid);
    expect(plan.create).toHaveLength(1);
  });

  it('categorias conflitantes: nenhuma regra ampla', () => {
    const plan = planLearning([it_('Mercado Bom', 1000, 'groceries'), it_('Mercado Bom', 2000, 'restaurants')], [], valid);
    expect(plan.create.filter((c) => c.amountCents === null)).toEqual([]);
  });

  it('conflito por estabelecimento ainda aprende valor exato consistente', () => {
    const plan = planLearning([it_('Mercado Bom', 1000, 'groceries'), it_('Mercado Bom', 2000, 'restaurants')], [], valid);
    expect(plan.create).toHaveLength(2);
    expect(plan.create.every((c) => c.amountCents !== null)).toBe(true);
  });

  it('intermediador/marketplace: só valor exato, nunca regra ampla', () => {
    expect(isAmbiguousMerchant('mercadolivre mercadol')).toBe(true);
    expect(isAmbiguousMerchant('apple com bill')).toBe(true);
    const plan = planLearning([it_('Mercadolivre*Loja', 3000, 'shopping')], [], valid);
    expect(plan.create).toEqual([{ merchantKey: 'mercadolivre loja', amountCents: 3000, category: 'shopping' }]);
  });

  it('mesmo valor com categorias diferentes em intermediador: não aprende nada', () => {
    const plan = planLearning([it_('Amazon Marketplace', 3000, 'shopping'), it_('Amazon Marketplace', 3000, 'leisure')], [], valid);
    expect(plan.create).toEqual([]);
  });

  it('categoria aplicada por regra não é evidência (sem circularidade)', () => {
    const plan = planLearning([it_('Padaria Central', 1200, 'groceries', 'rule', 'r1')], [], valid);
    expect(plan.create).toEqual([]);
  });

  it('classificação legada (sem origem) conta como confirmada', () => {
    const plan = planLearning([it_('Padaria Central', 1200, 'groceries', null)], [], valid);
    expect(plan.create).toHaveLength(1);
  });

  it('não cria regra duplicada nem sobrescreve a existente compatível', () => {
    const rule: CategoryRule = { id: 'r1', merchantKey: 'padaria central', amountCents: null, category: 'groceries' };
    const plan = planLearning([it_('Padaria Central', 1200, 'groceries')], [rule], valid);
    expect(plan).toEqual({ create: [], retarget: [], remove: [] });
  });

  it('corrigir item classificado por regra ampla remove a regra e preserva os itens', () => {
    const rule: CategoryRule = { id: 'r1', merchantKey: 'padaria central', amountCents: null, category: 'groceries' };
    const plan = planLearning([
      it_('Padaria Central', 1200, 'groceries', 'rule', 'r1'),
      it_('Padaria Central', 900, 'restaurants', 'user'),
    ], [rule], valid);
    expect(plan.remove).toEqual(['r1']);
    // Com o conflito registrado, não cria nova regra ampla.
    expect(plan.create.filter((c) => c.amountCents === null)).toEqual([]);
  });

  it('corrigir regra de valor exato ajusta a categoria da regra', () => {
    const rule: CategoryRule = { id: 'r2', merchantKey: 'apple com bill', amountCents: 6690, category: 'streaming' };
    const plan = planLearning([it_('Apple.Com/Bill', 6690, 'leisure', 'user')], [rule], valid);
    expect(plan.retarget).toEqual([{ ruleId: 'r2', category: 'leisure' }]);
  });

  it('ignora categoria inexistente no workspace', () => {
    expect(planLearning([it_('Padaria Central', 1000, 'apagada')], [], valid).create).toEqual([]);
  });
});
