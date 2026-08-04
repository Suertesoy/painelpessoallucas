/**
 * Projeto de uma PlanAction — vocabulário explícito para evitar a ambiguidade
 * de um projectId nullable sozinho ("herda do plano" vs. "não tem projeto"):
 *
 * - inherit  → usa o projectId do plano (execution_plans.project_id).
 * - specific → usa o projectId da própria ação (nunca o do plano).
 * - none     → a ação não pertence a nenhum projeto.
 *
 * Puro, sem I/O — reaproveitado pelos dois materializadores (ações únicas e
 * recorrências) e pela UI de revisão/detalhe do plano, para nunca duplicar a
 * regra de resolução.
 */

export type ProjectAssignment = 'inherit' | 'specific' | 'none';

export interface ProjectAssignmentSource {
  projectAssignment?: ProjectAssignment | string | null;
  projectId?: string | null;
}

/** Resolve o project_id efetivo de uma ação a partir da sua atribuição. */
export function resolveActionProjectId(
  action: ProjectAssignmentSource,
  planProjectId: string | null | undefined
): string | null {
  if (action.projectAssignment === 'specific') return action.projectId ?? null;
  if (action.projectAssignment === 'none') return null;
  // 'inherit' (ou ausente — linhas legadas anteriores a este campo).
  return planProjectId ?? null;
}

export interface ProjectAssignmentLabelSource {
  projectAssignment?: ProjectAssignment | string | null;
  projectId?: string | null;
  suggestedProjectName?: string | null;
}

export interface ProjectAssignmentLabel {
  text: string;
  /** muted = herda corretamente (sem necessidade de atenção); highlight =
   *  divergência confirmada pela IA (specific/none); alert = sugestão da IA
   *  aponta para um projeto que ainda não existe e precisa de decisão. */
  tone: 'muted' | 'highlight' | 'alert';
}

/** Rótulo humano do projeto efetivo de uma ação, para revisão e detalhe. */
export function describeActionProjectAssignment(
  action: ProjectAssignmentLabelSource,
  planProjectName: string | null,
  resolveProjectName: (projectId: string) => string | undefined
): ProjectAssignmentLabel {
  const assignment = action.projectAssignment ?? 'inherit';

  if (assignment === 'specific') {
    if (action.projectId) {
      return {
        text: `Projeto: ${resolveProjectName(action.projectId) ?? 'Projeto removido'}`,
        tone: 'highlight',
      };
    }
    if (action.suggestedProjectName) {
      return {
        text: `Projeto sugerido pela IA: ${action.suggestedProjectName} (ainda não existe — selecione)`,
        tone: 'alert',
      };
    }
    return { text: 'Projeto: a definir', tone: 'alert' };
  }

  if (assignment === 'none') {
    return { text: 'Projeto: sem projeto', tone: 'highlight' };
  }

  return { text: `Projeto: ${planProjectName ?? 'sem projeto'}`, tone: 'muted' };
}
