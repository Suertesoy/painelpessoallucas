/**
 * Identificador do workspace da Fase 1 (single-user, localStorage).
 *
 * Fase 2+: o workspace real vem da sessão (useWorkspace, em
 * providers/auth.provider.tsx). Esta constante permanece APENAS para o
 * assistente de migração reconhecer os dados locais antigos gravados
 * com 'ws-1'. Não usar em código novo.
 */
export const LEGACY_LOCAL_WORKSPACE_ID = 'ws-1';
