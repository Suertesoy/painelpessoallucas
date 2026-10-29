import type { EventRepository } from '@/platform/events/event.repository';
import type { SupabaseFinanceCashRepository } from '../infrastructure/supabase-finance-cash.repository';
import {
  ClassifyInput, ExpenseInput, FixedIncomeInput, type ClassifyInputT, type ExpenseInputT, type FixedIncomeInputT,
  CardGoalInput, CommitmentInput, InvoiceManualInput, ReceivableInput, SetBalanceInput, TransferInput,
  type CardGoalInputT, type CommitmentInputT, type InvoiceManualInputT, type ReceivableInputT, type SetBalanceInputT, type TransferInputT,
} from '../domain/cash.schema';
import type { MonthKey } from '../domain/month';
import { dateInputToISO, todayDateStr } from '@/lib/dates';
import { merchantKey } from '../domain/categories';
import {
  findCategoryByLabel, isValidCategoryId, slugifyCategory, type CategoryRule,
} from '../domain/category-rules';

/** Como aprender com um lançamento: 'amount' = mesmo estabelecimento e mesmo valor; 'merchant' = qualquer valor (autorização explícita). */
export type LearnMode = 'amount' | 'merchant';

/**
 * Commands do caixa: validam com Zod, delegam ao repositório (funções SQL
 * transacionais quando há saldo envolvido) e emitem eventos de domínio SEM
 * valores monetários no payload (dado financeiro não vai para a trilha de
 * eventos).
 */
export class FinanceCashCommands {
  constructor(
    private repo: SupabaseFinanceCashRepository,
    private eventRepo: EventRepository,
    private workspaceId: string
  ) {}

  private async emit(type: string, entityId: string, payload: Record<string, unknown> = {}) {
    await this.eventRepo.save({
      id: crypto.randomUUID(), type, entityId, workspaceId: this.workspaceId, source: 'manual',
      payload, createdAt: new Date().toISOString(),
    });
  }

  async setBalance(input: SetBalanceInputT, expected?: { updatedAt?: string | null; availableUpdatedAt?: string | null; reserveUpdatedAt?: string | null }) {
    const v = SetBalanceInput.parse(input);
    const balance = await this.repo.setBalance(v.availableCents ?? null, v.reserveCents ?? null, expected);
    await this.emit('finance.balance_updated', this.workspaceId, {
      available: v.availableCents !== undefined, reserve: v.reserveCents !== undefined,
    });
    return balance;
  }

  async transfer(input: TransferInputT) {
    const v = TransferInput.parse(input);
    const balance = await this.repo.transfer(v.direction, v.amountCents, v.note ?? null, v.requestId);
    await this.emit('finance.reserve_transferred', v.requestId, { direction: v.direction });
    return balance;
  }

  async createReceivable(input: ReceivableInputT) {
    const created = await this.repo.createReceivable(ReceivableInput.parse(input));
    await this.emit('finance.receivable_created', created.id);
    return created;
  }

  async updateReceivable(id: string, input: ReceivableInputT, expectedUpdatedAt?: string) {
    await this.repo.updateReceivable(id, ReceivableInput.parse(input), expectedUpdatedAt);
    await this.emit('finance.receivable_updated', id);
  }

  async cancelReceivable(id: string) {
    await this.repo.updateReceivable(id, { status: 'cancelled' });
    await this.emit('finance.receivable_cancelled', id);
  }

  async setReceivableCertainty(id: string, status: 'confirmed' | 'uncertain') {
    await this.repo.updateReceivable(id, { status });
    await this.emit('finance.receivable_updated', id);
  }

  /** `addToBalance`: soma ao saldo; desligue se o saldo já foi atualizado depois do recebimento. */
  async markReceived(id: string, addToBalance: boolean) {
    await this.repo.markReceived(id, addToBalance);
    await this.emit('finance.receivable_received', id, { addedToBalance: addToBalance });
  }

  async createCommitment(input: CommitmentInputT) {
    const created = await this.repo.createCommitment(CommitmentInput.parse(input));
    await this.emit('finance.commitment_created', created.id);
    return created;
  }

  async updateCommitment(id: string, input: CommitmentInputT, expectedUpdatedAt?: string) {
    await this.repo.updateCommitment(id, CommitmentInput.parse(input), expectedUpdatedAt);
    await this.emit('finance.commitment_updated', id);
  }

  async archiveCommitment(id: string) {
    await this.repo.setCommitmentActive(id, false);
    await this.emit('finance.commitment_archived', id);
  }

  async markCommitmentPaid(commitmentId: string, month: MonthKey, deductFromBalance: boolean) {
    await this.repo.markCommitmentPaid(commitmentId, month, deductFromBalance);
    await this.emit('finance.commitment_paid', commitmentId, { month, deductedFromBalance: deductFromBalance });
  }

  async setOccurrenceAmount(commitmentId: string, month: MonthKey, amountCents: number | null) {
    if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0)) throw new Error('O valor deve ser maior que zero.');
    await this.repo.setOccurrence(commitmentId, month, { amountCents });
    await this.emit('finance.commitment_amount_changed', commitmentId, { month });
  }

  async setIncludedInInvoice(commitmentId: string, month: MonthKey, included: boolean) {
    await this.repo.setOccurrence(commitmentId, month, { status: included ? 'included_in_invoice' : 'pending' });
    await this.emit('finance.commitment_inclusion_changed', commitmentId, { month, included });
  }

  async saveInvoiceManual(input: InvoiceManualInputT) {
    await this.repo.saveInvoiceManual(InvoiceManualInput.parse(input));
    await this.emit('finance.invoice_saved', `${input.card}:${input.month}`);
  }

  async setInvoiceStatus(id: string, status: 'open' | 'closed') {
    await this.repo.setInvoiceStatus(id, status);
    await this.emit('finance.invoice_status_changed', id, { status });
  }

  async reopenInvoice(id: string) {
    await this.repo.reopenInvoice(id);
    await this.emit('finance.invoice_reopened', id);
  }

  /**
   * Situação da fatura em um só ponto (Aberta / Fechada / Paga), inclusive para
   * CORRIGIR um status errado. Nunca apaga lançamentos nem histórico.
   *  - Paga + deductFromBalance=false: confirmação HISTÓRICA — o pagamento já saiu do
   *    saldo antes; só registra a data e tira a fatura das pendências (não mexe no saldo).
   *  - Paga + deductFromBalance=true: operação que MOVE o saldo atual (uma única vez:
   *    a função SQL é idempotente e não desconta de fatura já paga).
   *  - Aberta/Fechada: desfaz a baixa (limpa a data). O saldo NÃO é devolvido: o app
   *    não sabe se aquele pagamento chegou a sair dele.
   */
  async changeInvoiceStatus(
    id: string,
    target: 'open' | 'closed' | 'paid',
    opts: { paidOn?: string; deductFromBalance?: boolean } = {}
  ) {
    if (target !== 'paid') {
      await this.repo.changeInvoiceStatus(id, target, null);
      await this.emit('finance.invoice_status_changed', id, { status: target });
      return;
    }
    const paidOn = opts.paidOn ?? todayDateStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00`))) {
      throw new Error('Informe uma data de pagamento válida.');
    }
    if (paidOn > todayDateStr()) throw new Error('A data de pagamento não pode ser no futuro.');
    const paidAtISO = dateInputToISO(paidOn) as string;
    const deduct = opts.deductFromBalance === true;
    if (deduct) {
      await this.repo.markInvoicePaid(id, true);
      await this.repo.setInvoicePaidAt(id, paidAtISO);
    } else {
      await this.repo.changeInvoiceStatus(id, 'paid', paidAtISO);
    }
    await this.emit('finance.invoice_status_changed', id, { status: 'paid', deductedFromBalance: deduct });
  }

  /**
   * Meta mensal CONJUNTA dos cartões (valor manual da casa). 'default' vale a partir do mês
   * informado; 'month' é exceção só daquele mês. Não toca em faturas, saldos nem lançamentos.
   */
  async setCardGoal(input: CardGoalInputT) {
    const v = CardGoalInput.parse(input);
    await this.repo.upsertCardGoal(v.scope, v.month, v.amountCents);
    await this.emit('finance.card_goal_set', `${v.scope}:${v.month}`, { scope: v.scope, month: v.month });
  }

  /** Remove a exceção do mês (volta à meta padrão) ou a meta padrão que começou naquele mês. */
  async clearCardGoal(scope: 'default' | 'month', month: MonthKey) {
    CardGoalInput.pick({ scope: true, month: true }).parse({ scope, month });
    await this.repo.deleteCardGoal(scope, month);
    await this.emit('finance.card_goal_cleared', `${scope}:${month}`, { scope, month });
  }

  async markInvoicePaid(id: string, deductFromBalance: boolean) {
    await this.repo.markInvoicePaid(id, deductFromBalance);
    await this.emit('finance.invoice_paid', id, { deductedFromBalance: deductFromBalance });
  }

  /** Revisão de lançamento ausente do último CSV: 'keep' confirma, 'remove' tira da fatura. */
  async resolveMissingItem(itemId: string, action: 'keep' | 'remove') {
    await this.repo.resolveMissingItem(itemId, action);
    await this.emit('finance.invoice_item_reviewed', itemId, { action });
  }

  // -------- classificação (só rótulos; nunca altera valores) --------
  /** A categoria precisa existir na lista do workspace (ou na lista inicial, antes da migration). */
  private async assertKnownCategory(category: string) {
    const { categories } = await this.repo.listCategories();
    if (!categories.some((c) => c.id === category)) throw new Error('Categoria inválida.');
  }

  async classifyItems(input: ClassifyInputT) {
    const v = ClassifyInput.parse(input);
    if (v.category) await this.assertKnownCategory(v.category);
    await this.repo.classifyItems(v.itemIds, { category: v.category, purpose: v.purpose });
    // Escolher a categoria é o aprendizado: sem segunda confirmação. A política só cria regra com evidência consistente.
    try { await this.repo.applyCategoryRules(); } catch { /* melhor esforço: a classificação já foi salva */ }
    await this.emit('finance.invoice_items_classified', v.itemIds[0], { count: v.itemIds.length });
  }

  private static cleanName(label: string): string {
    const name = label.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 40) throw new Error('Use um nome de 2 a 40 caracteres.');
    return name;
  }

  // -------- despesas pontuais (Pix, débito, dinheiro) --------
  /**
   * Registra um gasto já pago fora do cartão. Não cria compromisso futuro. Com
   * `learn`, também aprende a categoria para lançamentos semelhantes (opt-in).
   */
  async recordExpense(input: ExpenseInputT, learn?: LearnMode) {
    const v = ExpenseInput.parse(input);
    if (v.category) await this.assertKnownCategory(v.category);
    const expense = await this.repo.recordExpense(v);
    if (learn && v.category) {
      await this.repo.saveCategoryRule({
        merchantKey: merchantKey(v.description), amountCents: learn === 'amount' ? v.amountCents : null, category: v.category,
      });
      await this.repo.applyCategoryRules();
    }
    await this.emit('finance.expense_recorded', expense.id, { method: v.paymentMethod, deducted: v.deductFromBalance });
    return expense;
  }

  /** Exclui o gasto; `restoreBalance` devolve ao saldo o que foi descontado quando ele foi registrado. */
  async deleteExpense(id: string, restoreBalance: boolean) {
    await this.repo.deleteExpense(id, restoreBalance);
    await this.emit('finance.expense_deleted', id, { restoreBalance });
  }

  async setExpenseCategory(id: string, category: string | null) {
    if (category) {
      if (!isValidCategoryId(category)) throw new Error('Categoria inválida.');
      await this.assertKnownCategory(category);
    }
    await this.repo.setExpenseCategory(id, category);
    await this.emit('finance.expense_classified', id);
  }

  /** Cria uma categoria (ou devolve a que já existe com esse nome). O id é estável e nunca muda ao renomear. */
  async createCategory(label: string): Promise<string> {
    const name = FinanceCashCommands.cleanName(label);
    const { categories, persisted } = await this.repo.listCategories();
    if (!persisted) throw new Error('As categorias ainda não podem ser editadas: a atualização do banco está pendente.');
    const existing = findCategoryByLabel(name, categories);
    if (existing) return existing;
    const id = slugifyCategory(name, categories.map((c) => c.id));
    await this.repo.createCategory({ id, label: name });
    await this.emit('finance.category_created', id);
    return id;
  }

  /** Renomeia (inclusive as da lista inicial). Só o nome muda: lançamentos e regras seguem apontando para o mesmo id. */
  async renameCategory(id: string, label: string) {
    const name = FinanceCashCommands.cleanName(label);
    const { categories, persisted } = await this.repo.listCategories();
    if (!persisted) throw new Error('As categorias ainda não podem ser editadas: a atualização do banco está pendente.');
    if (!categories.some((c) => c.id === id)) throw new Error('Categoria não encontrada.');
    if (findCategoryByLabel(name, categories, id)) throw new Error('Já existe uma categoria com esse nome.');
    await this.repo.renameCategory(id, name);
    await this.emit('finance.category_renamed', id);
  }

  countCategoryUse(id: string) {
    return this.repo.countCategoryUse(id);
  }

  /**
   * Exclui a categoria. `replacementId` é opcional: sem ele, os lançamentos ficam
   * "Sem categoria" e as regras da categoria são removidas. Nunca remapeia sozinho.
   */
  async deleteCategory(id: string, replacementId: string | null = null) {
    const { categories, persisted } = await this.repo.listCategories();
    if (!persisted) throw new Error('As categorias ainda não podem ser editadas: a atualização do banco está pendente.');
    if (!categories.some((c) => c.id === id)) throw new Error('Categoria não encontrada.');
    if (replacementId !== null && (replacementId === id || !categories.some((c) => c.id === replacementId))) {
      throw new Error('Categoria substituta inválida.');
    }
    await this.repo.deleteCategory(id, replacementId);
    await this.emit('finance.category_deleted', id, { replaced: replacementId !== null });
  }

  /**
   * Classifica UM lançamento e, só se pedido, aprende a regra (opt-in):
   * 'amount' = estabelecimento + valor; 'merchant' = qualquer valor. A regra
   * só preenche lançamentos SEM categoria; nada confirmado é sobrescrito.
   */
  async classifyAndLearn(itemId: string, category: string, mode: LearnMode): Promise<{ rule: CategoryRule; applied: number }> {
    if (!isValidCategoryId(category)) throw new Error('Categoria inválida.');
    await this.assertKnownCategory(category);
    const item = await this.repo.getItem(itemId);
    if (!item) throw new Error('Lançamento não encontrado.');
    if (item.kind === 'payment') throw new Error('Pagamentos de fatura não são classificados.');
    await this.repo.classifyItems([itemId], { category });
    const rule = await this.repo.saveCategoryRule({
      merchantKey: merchantKey(item.baseDescription),
      amountCents: mode === 'amount' ? item.amountCents : null,
      category,
    });
    const applied = await this.repo.applyCategoryRules();
    await this.emit('finance.category_rule_saved', rule.id, { applied, anyAmount: mode === 'merchant' });
    return { rule, applied };
  }

  async changeRuleCategory(ruleId: string, category: string) {
    if (!isValidCategoryId(category)) throw new Error('Categoria inválida.');
    await this.assertKnownCategory(category);
    await this.repo.changeRuleCategory(ruleId, category);
    await this.emit('finance.category_rule_changed', ruleId);
  }

  /** Exclui a regra; com `revertItems`, os lançamentos que ELA classificou voltam a "sem categoria". */
  async deleteCategoryRule(ruleId: string, revertItems: boolean) {
    await this.repo.deleteCategoryRule(ruleId, revertItems);
    await this.emit('finance.category_rule_deleted', ruleId, { revertItems });
  }

  countRuleItems(ruleId: string) {
    return this.repo.countRuleItems(ruleId);
  }

  /** Reaplica as regras aos lançamentos ainda sem categoria (idempotente). */
  applyCategoryRules() {
    return this.repo.applyCategoryRules();
  }

  // -------- entradas fixas --------
  async createFixedIncome(input: FixedIncomeInputT) {
    const created = await this.repo.createFixedIncome(FixedIncomeInput.parse(input));
    await this.emit('finance.fixed_income_created', created.id);
    return created;
  }

  async updateFixedIncome(id: string, input: FixedIncomeInputT) {
    await this.repo.updateFixedIncome(id, FixedIncomeInput.parse(input));
    await this.emit('finance.fixed_income_updated', id);
  }

  async deactivateFixedIncome(id: string) {
    await this.repo.setFixedIncomeActive(id, false);
    await this.emit('finance.fixed_income_deactivated', id);
  }

  async setIncomeMonthAmount(incomeId: string, month: MonthKey, amountCents: number | null) {
    if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0)) throw new Error('O valor deve ser maior que zero.');
    await this.repo.setIncomeMonthAmount(incomeId, month, amountCents);
    await this.emit('finance.fixed_income_amount_changed', incomeId, { month });
  }

  /** addToBalance: ligado por padrão na tela; desligue se o saldo já foi atualizado. Idempotente. */
  async markIncomeReceived(incomeId: string, month: MonthKey, addToBalance: boolean) {
    await this.repo.markIncomeReceived(incomeId, month, addToBalance);
    await this.emit('finance.fixed_income_received', incomeId, { month, addedToBalance: addToBalance });
  }

  async resetIncomeOccurrence(incomeId: string, month: MonthKey, status: 'pending' | 'cancelled', removeFromBalance: boolean) {
    await this.repo.resetIncomeOccurrence(incomeId, month, status, removeFromBalance);
    await this.emit('finance.fixed_income_occurrence_changed', incomeId, { month, status });
  }

  async linkInvoiceItem(itemId: string, commitmentId: string | null) {
    await this.repo.linkItem(itemId, commitmentId);
    await this.emit('finance.invoice_item_linked', itemId, { linked: commitmentId !== null });
  }
}
