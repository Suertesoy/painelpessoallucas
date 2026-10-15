import { redirect } from 'next/navigation';

/** Rota antiga preservada para não quebrar links salvos: Notas agora vive em /notas. */
export default function IdeiasRedirect() {
  redirect('/notas');
}
