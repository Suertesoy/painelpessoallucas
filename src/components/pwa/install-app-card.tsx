'use client';

import { useState } from 'react';
import { CheckCircle2, Download, MonitorSmartphone, Share } from 'lucide-react';
import { usePwaInstall } from '@/lib/use-pwa-install';

/**
 * Área discreta de instalação em Configurações. Estados possíveis:
 * - já instalado: confirmação, sem oferecer instalação de novo;
 * - prompt nativo disponível (Android/desktop Chromium): botão explícito;
 * - iOS sem prompt nativo: instrução curta para "Adicionar à Tela de Início";
 * - sem suporte nenhum: nada é renderizado (sem botão sem função).
 */
export function InstallAppCard() {
  const { isStandalone, isIOS, canPromptInstall, promptInstall } = usePwaInstall();
  const [dismissedAt, setDismissedAt] = useState<'accepted' | 'dismissed' | null>(null);

  const showButton = canPromptInstall && !isStandalone;
  const showIOSInstructions = isIOS && !isStandalone && !canPromptInstall;

  if (!isStandalone && !showButton && !showIOSInstructions) {
    return null;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MonitorSmartphone size={18} className="text-gray-400" />
        Aplicativo
      </h2>

      {isStandalone && (
        <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
          <CheckCircle2 size={16} className="text-green-600" />
          O Painel Lucas já está instalado neste dispositivo.
        </p>
      )}

      {showButton && (
        <div className="mt-3">
          <p className="text-sm text-gray-600">
            Instale o Painel Lucas para abrir em janela própria, com ícone na tela
            inicial ou na área de trabalho.
          </p>
          <button
            type="button"
            onClick={async () => {
              const outcome = await promptInstall();
              setDismissedAt(outcome === 'unavailable' ? null : outcome);
            }}
            className="mt-3 flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Download size={16} /> Instalar aplicativo
          </button>
          {dismissedAt === 'dismissed' && (
            <p className="mt-2 text-xs text-gray-500">
              Você pode instalar quando quiser voltando a esta tela.
            </p>
          )}
        </div>
      )}

      {showIOSInstructions && (
        <p className="mt-3 flex items-start gap-2 text-sm text-gray-600">
          <Share size={16} className="mt-0.5 shrink-0 text-gray-400" />
          No iPhone ou iPad, toque em <strong className="font-medium">Compartilhar</strong> e
          depois em <strong className="font-medium">&quot;Adicionar à Tela de Início&quot;</strong>.
        </p>
      )}
    </section>
  );
}
