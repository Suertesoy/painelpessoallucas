# Finanças — situação das faturas e sustentabilidade mensal

## Situação da fatura
Em **Finanças › Faturas** (e no detalhe da fatura) o botão **Situação** abre a tela para escolher:

| Situação | Significado | Pendência? | Entra na média? |
|---|---|---|---|
| Aberta | ainda recebendo compras; valor pode mudar | sim | **não** (não é mês completo) |
| Fechada | valor consolidado, ainda não paga | sim | sim (mês anterior ao atual) |
| Paga | quitada por inteiro | não | sim (mês anterior ao atual) |

Marcar como **Paga** tem dois caminhos separados:

- **Confirmar pagamento que já aconteceu** (padrão): grava a data e tira a fatura das pendências. **Não mexe no saldo.**
- **Descontar agora do saldo disponível**: usa `finance_mark_invoice_paid`, que é idempotente (fatura já paga nunca desconta de novo).

Voltar de **Paga** para Aberta/Fechada é a *correção* de uma baixa errada: pede confirmação, limpa a data de pagamento, não apaga lançamentos, importações nem histórico e **não altera o saldo** (o app não sabe se aquele pagamento saiu dele).

Importação de CSV: a situação inicial é a atual da fatura (ou a escolhida no formulário). Reimportar nunca altera uma fatura paga (o serviço recusa com `invoice_paid` e o SQL preserva `paid`).

Nenhuma mudança de banco foi necessária: a correção usa o UPDATE já permitido pela RLS em `finance_card_invoices`.

## Dois conceitos separados
1. **Caixa real** (`projectCash`): saldo disponível de hoje + o que está registrado e pendente (entradas esperadas, contas, faturas não pagas). Encadeia mês a mês e mostra faltas reais (inclusive acumuladas). Não inclui médias/estimativas. A reserva nunca entra.
2. **Sustentabilidade mensal** (`buildSustainability`): cada mês sozinho — `entradas cadastradas − compromissos diretos − cartões`. **Nenhum déficit é levado para o mês seguinte.** Considera o mês inteiro (pago/recebido também conta).

### Três leituras do mês
1. **Conhecido** — só o que está cadastrado (faturas lançadas + gastos fixos no cartão sem fatura).
2. **Mantendo a média** — hipótese: média das 3 últimas faturas **fechadas/pagas** por cartão (mês de vencimento anterior ao atual). Fatura real fechada/paga substitui a média; fatura aberta (parcial) vale o lançado e só a diferença até a média é estimada. Menos de 3 meses confiáveis → limitação explicada, nada inventado.
3. **Meta sem usar a reserva** — limite combinado dos cartões = entradas cadastradas − compromissos diretos (um valor único da casa, sem divisão por pessoa). Se as entradas não cobrem os diretos, o painel diz isso e não assume que a reserva cobre.

Entradas do mês, saldo disponível e reserva protegida são exibidos separadamente; o resultado depende só das entradas **cadastradas**.

## Finanças por mês, meta conjunta e comparativo
- A tela `/financas` mostra **um mês por vez** (setas, "Voltar ao mês atual"). Tudo vem de `buildMonthView(snapshot, mês)` (`domain/month-view.ts`): resumo, meta, compromissos, entradas, faturas, parcelas e sustentabilidade usam a mesma visão.
- **Resultado do mês inteiro** (recebido + previsto, pago + pendente) × **caixa restante** (saldo de hoje + pendências; só do mês atual em diante). Meses encerrados não reconstroem saldo de época e não têm hipóteses.
- **Meta conjunta dos cartões** (`finance_card_goals`, migration `20261017100000`): valor manual da casa; `default` = a partir de um mês, `month` = exceção. Sem meta definida, nada é inventado. Barra de progresso = só o lançado nas faturas; a média (hipótese) fica à parte. Aviso discreto se a meta passar do limite sustentável; nunca bloqueia.
- **Parcelas**: lançadas (já dentro das faturas, não somam de novo) × inferidas (informativas, fora de qualquer total) × hipótese da média (outra coisa).
- **Comparativo** em `/financas/comparativo`: barras simples com a meta tracejada, mês fechado (sólido) × incompleto (listrado), meses sem meta e tabela com valores exatos.
- O limite "meta sem a reserva" é um valor único da casa: **não há divisão por Lucas/Matheus**.
- Validação SQL local: `node supabase/tests/validate-card-goals-migration.mjs <pasta-do-pglite> supabase/migrations`.
