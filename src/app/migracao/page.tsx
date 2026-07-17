'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMounted } from '@/lib/hooks';
import { CheckCircle, AlertCircle, Download, Trash2, ArrowRight } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/platform/supabase/browser-client';
import { useWorkspace } from '@/providers/auth.provider';
import {
  readLocalData,
  hasLocalData,
  getMigrationState,
  downloadBackup,
  migrateLocalData,
  clearLocalData,
  type LocalDataSnapshot,
  type MigrationResult,
  type MigrationState,
} from '@/modules/migration/local-data-migration';

type WizardStep = 'idle' | 'running' | 'done' | 'error';

export default function MigracaoPage() {
  const { workspaceId } = useWorkspace();
  const mounted = useMounted();
  const [refreshKey, setRefreshKey] = useState(0);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [step, setStep] = useState<WizardStep>('idle');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  // localStorage só existe no cliente: lê após a hidratação (useMounted),
  // sem setState em effect (regra do lint) e sem mismatch de hidratação.
  const snapshot = useMemo<LocalDataSnapshot | null>(
    () => (mounted ? readLocalData() : null),
    // refreshKey força releitura do localStorage após limpeza/migração.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, refreshKey]
  );
  const migrationState = useMemo<MigrationState | null>(
    () => (mounted ? getMigrationState() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounted, refreshKey, step]
  );

  const counts = useMemo(
    () =>
      snapshot
        ? [
            { label: 'Itens', value: snapshot.items.length },
            { label: 'Projetos', value: snapshot.projects.length },
            { label: 'Planos diários', value: snapshot.dailyPlans.length },
            { label: 'Eventos (histórico)', value: snapshot.events.length },
          ]
        : [],
    [snapshot]
  );

  const handleBackup = () => {
    downloadBackup();
    setBackupDownloaded(true);
  };

  const handleMigrate = async () => {
    if (!snapshot) return;
    setStep('running');
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const res = await migrateLocalData(supabase, workspaceId, snapshot, setProgress);
      setResult(res);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado durante a migração.');
      setStep('error');
    }
  };

  const handleClearLocal = () => {
    clearLocalData();
    setCleared(true);
    setConfirmClear(false);
    setRefreshKey((k) => k + 1);
  };

  if (!snapshot) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <p className="text-sm text-gray-500">Verificando dados locais…</p>
      </div>
    );
  }

  const nothingToMigrate = !hasLocalData(snapshot);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Migração dos dados locais</h1>
      <p className="mt-2 text-sm text-gray-600">
        Os dados da Fase 1 viviam apenas neste navegador. Esta migração os envia
        para o seu workspace na nuvem. Nada é apagado automaticamente.
      </p>

      {migrationState && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            Migração concluída em{' '}
            {new Date(migrationState.completedAt).toLocaleString('pt-BR')} (lote{' '}
            <code className="text-xs">{migrationState.batchId.slice(0, 8)}</code>).
            Reexecutar é seguro: nenhum registro é duplicado.
          </div>
        </div>
      )}

      {nothingToMigrate && !cleared && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Nenhum dado local da Fase 1 foi encontrado neste navegador.
          <div className="mt-3">
            <Link href="/hoje" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              Ir para o painel <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {cleared && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Dados locais antigos removidos deste navegador. Seus dados agora vivem na nuvem.
          <div className="mt-3">
            <Link href="/hoje" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              Ir para o painel <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {!nothingToMigrate && (
        <>
          {/* Passo 1 — prévia */}
          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="font-semibold">1. Prévia dos dados encontrados</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {counts.map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-50 p-3 text-center">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {snapshot.invalid.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  Registros inválidos ignorados na validação:{' '}
                  {snapshot.invalid
                    .map((i) => `${i.count} em ${i.collection} (${i.firstError})`)
                    .join('; ')}
                  . Eles permanecem no backup JSON.
                </div>
              </div>
            )}
          </section>

          {/* Passo 2 — backup */}
          <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="font-semibold">2. Backup antes de migrar</h2>
            <p className="mt-1 text-sm text-gray-600">
              Baixe uma cópia completa dos dados locais (inclusive registros inválidos).
            </p>
            <button
              type="button"
              onClick={handleBackup}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download size={16} />
              {backupDownloaded ? 'Baixar novamente' : 'Baixar backup JSON'}
            </button>
          </section>

          {/* Passo 3 — migrar */}
          <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="font-semibold">3. Migrar para a nuvem</h2>
            <p className="mt-1 text-sm text-gray-600">
              Os registros são enviados com os identificadores originais — repetir a
              migração não duplica nada.
            </p>

            {step === 'running' && (
              <p className="mt-3 text-sm text-blue-700" role="status">
                {progress || 'Migrando…'}
              </p>
            )}

            {step === 'error' && error && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error} — o backup e os dados locais permanecem intactos. Você pode tentar novamente.
              </p>
            )}

            {step === 'done' && result && (
              <div className="mt-3 rounded-lg bg-green-50 p-4 text-sm text-green-800">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle size={16} /> Migração concluída e conferida.
                </p>
                <table className="mt-2 w-full text-left text-xs">
                  <thead>
                    <tr className="text-green-700">
                      <th className="py-1 pr-4 font-medium">Coleção</th>
                      <th className="py-1 pr-4 font-medium">Local</th>
                      <th className="py-1 font-medium">Na nuvem</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="py-0.5 pr-4">Itens</td><td>{result.migrated.items}</td><td>{result.remote.items}</td></tr>
                    <tr><td className="py-0.5 pr-4">Projetos</td><td>{result.migrated.projects}</td><td>{result.remote.projects}</td></tr>
                    <tr><td className="py-0.5 pr-4">Planos diários</td><td>{result.migrated.dailyPlans}</td><td>{result.remote.dailyPlans}</td></tr>
                    <tr><td className="py-0.5 pr-4">Eventos</td><td>{result.migrated.events}</td><td>{result.remote.events}</td></tr>
                  </tbody>
                </table>
                {!result.matches && (
                  <p className="mt-2 text-amber-800">
                    Atenção: as quantidades remotas são menores que as locais. Reexecute a
                    migração ou verifique os registros inválidos.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleMigrate}
              disabled={step === 'running'}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {step === 'running'
                ? 'Migrando…'
                : migrationState || step === 'done'
                  ? 'Reexecutar migração'
                  : 'Iniciar migração'}
            </button>
          </section>

          {/* Passo 4 — limpeza opcional */}
          {(migrationState || step === 'done') && (
            <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="font-semibold">4. Remover dados locais antigos (opcional)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Depois de conferir que está tudo na nuvem, você pode limpar os dados da
                Fase 1 deste navegador. O backup baixado continua válido.
              </p>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Remover dados locais…
                </button>
              ) : (
                <div className="mt-3 rounded-lg bg-red-50 p-4">
                  <p className="text-sm text-red-800">
                    Tem certeza? Esta ação remove os dados da Fase 1 apenas deste navegador.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleClearLocal}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Sim, remover
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
