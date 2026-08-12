'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useReactiveQuery, useMounted, useNow } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { Item } from '@/modules/items/domain/item.schema';
import { todayDateStr } from '@/lib/dates';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { DataErrorNotice } from '@/components/data-error-notice';
import { openItemDetail } from '@/lib/ui-events';
import { formatMinutes } from '@/lib/capacity';
import {
  getBlocksForDate,
  getCurrentBlock,
  getNextBlock,
  findNextCompatibleBlockToday,
  nextBusinessDayStr,
  minutesRemainingInBlock,
  blockDurationMinutes,
  roleCapacityMinutesForDate,
  selectTasksForBlock,
  computeLoad,
  classifyPendingItems,
  blockStartIso,
  localDateTimeToIso,
  tasksScheduledOnDate,
  localTimeParts,
  isBusinessDay,
  type RoutineSlotRole,
  type LoadSummary,
} from '@/modules/routine/domain/routine-engine';
import { NowCard } from '@/components/routine/now-card';
import { DayTimeline } from '@/components/routine/day-timeline';
import { NextEventCard } from '@/components/routine/next-event-card';
import { PendingItemsCard } from '@/components/routine/pending-items-card';

interface RoutineAssignment {
  primaryProjectId: string | null;
  secondaryProjectId: string | null;
}

export default function HojePage() {
  const { item: itemQueries, project: projectQueries, learning: learningQueries } = useQueries();
  const { item: itemCmds } = useCommands();
  const mounted = useMounted();
  const now = useNow();
  const today = todayDateStr();

  const { data: allItems, error: allItemsError, isOffline, refetch: refetchAllItems } = useReactiveQuery(
    () => itemQueries.listItems(),
    []
  );
  const { data: projects, error: projectsError } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const { data: learningToday } = useReactiveQuery(
    () => learningQueries.getTodayStudySummary(today, 30),
    [today]
  );

  const [assignment, setAssignment] = useState<RoutineAssignment>({ primaryProjectId: null, secondaryProjectId: null });
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/routine');
        if (res.ok) setAssignment(await res.json());
      } catch {
        // Sem atribuição configurada ainda: a Home mostra o aviso de configuração.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const blocks = useMemo(() => getBlocksForDate(today), [today]);
  const nowLocal = mounted ? localTimeParts(now).time : null;
  const currentBlock = useMemo(
    () => (nowLocal ? getCurrentBlock(blocks, nowLocal) : null),
    [blocks, nowLocal]
  );
  const nextBlock = useMemo(() => getNextBlock(blocks, currentBlock), [blocks, currentBlock]);

  const roleProjectId = (role: RoutineSlotRole | undefined): string | undefined => {
    if (role === 'deep_work_primary') return assignment.primaryProjectId ?? undefined;
    if (role === 'deep_work_secondary') return assignment.secondaryProjectId ?? undefined;
    return undefined;
  };
  const projectNameById = (id?: string) => (id ? projects?.find((p) => p.id === id)?.name : undefined);

  const currentRoleProjectId = roleProjectId(currentBlock?.role);
  const currentRoleProjectName = projectNameById(currentRoleProjectId) ?? null;
  const hasRoleAssignment =
    currentBlock?.role === 'deep_work_primary'
      ? Boolean(assignment.primaryProjectId)
      : currentBlock?.role === 'deep_work_secondary'
        ? Boolean(assignment.secondaryProjectId)
        : true;

  const tasksInCurrentBlock = useMemo(() => {
    if (!currentBlock || !allItems) return [] as Item[];
    return selectTasksForBlock(currentBlock, allItems, today, currentRoleProjectId);
  }, [currentBlock, allItems, today, currentRoleProjectId]);

  const currentBlockLoad: LoadSummary | null =
    currentBlock && (currentBlock.role === 'deep_work_primary' || currentBlock.role === 'deep_work_secondary')
      ? computeLoad(tasksInCurrentBlock, blockDurationMinutes(currentBlock))
      : null;

  const minutesRemaining = currentBlock && nowLocal ? minutesRemainingInBlock(currentBlock, nowLocal) : 0;

  const canMoveToNextCompatibleBlock = Boolean(
    currentBlock && findNextCompatibleBlockToday(blocks, currentBlock)
  );

  const pendingGroups = useMemo(() => {
    if (!allItems) return [];
    return classifyPendingItems(allItems, today);
  }, [allItems, today]);

  const roleProjectNames = {
    deep_work_primary: projectNameById(assignment.primaryProjectId ?? undefined),
    deep_work_secondary: projectNameById(assignment.secondaryProjectId ?? undefined),
  };

  const [pendingMove, setPendingMove] = useState<{
    itemId: string;
    itemTitle: string;
    newScheduledAt: string;
    projected: LoadSummary;
  } | null>(null);

  const requestMove = (item: Item, newScheduledAt: string, projected: LoadSummary | null) => {
    if (projected?.overCapacity) {
      setPendingMove({ itemId: item.id, itemTitle: item.title ?? 'tarefa', newScheduledAt, projected });
    } else {
      void itemCmds.scheduleItem(item.id, newScheduledAt);
    }
  };

  const confirmPendingMove = async () => {
    if (!pendingMove) return;
    await itemCmds.scheduleItem(pendingMove.itemId, pendingMove.newScheduledAt);
    setPendingMove(null);
  };

  const projectedLoadForRoleOnDate = (
    destDateStr: string,
    role: RoutineSlotRole,
    movingItem: Item,
    newScheduledAt: string
  ): LoadSummary => {
    const destRoleProjectId = roleProjectId(role);
    const already = tasksScheduledOnDate(allItems ?? [], destDateStr, destRoleProjectId).filter(
      (t) => t.id !== movingItem.id
    );
    return computeLoad(
      [...already, { ...movingItem, scheduledAt: newScheduledAt }],
      roleCapacityMinutesForDate(destDateStr, role)
    );
  };

  const handleComplete = (id: string) => itemCmds.completeItem(id);

  const handleMoveNextCompatibleBlock = (item: Item) => {
    if (!currentBlock) return;
    const target = findNextCompatibleBlockToday(blocks, currentBlock);
    if (!target) return;
    const newScheduledAt = blockStartIso(today, target);
    const projected = projectedLoadForRoleOnDate(today, target.role, item, newScheduledAt);
    requestMove(item, newScheduledAt, projected);
  };

  const handleMoveNextBusinessDay = (item: Item) => {
    if (!currentBlock) return;
    const destDate = nextBusinessDayStr(today);
    const time = item.scheduledAt ? localTimeParts(new Date(item.scheduledAt)).time : currentBlock.startTime;
    const newScheduledAt = localDateTimeToIso(destDate, time);
    const isWorkRole = currentBlock.role === 'deep_work_primary' || currentBlock.role === 'deep_work_secondary';
    const projected = isWorkRole ? projectedLoadForRoleOnDate(destDate, currentBlock.role, item, newScheduledAt) : null;
    requestMove(item, newScheduledAt, projected);
  };

  const handleBringPendingToToday = (item: Item) => {
    const role: RoutineSlotRole | undefined =
      item.projectId && item.projectId === assignment.primaryProjectId
        ? 'deep_work_primary'
        : item.projectId && item.projectId === assignment.secondaryProjectId
          ? 'deep_work_secondary'
          : undefined;

    const targetBlock = role
      ? currentBlock?.role === role
        ? currentBlock
        : blocks.find((b) => b.role === role) ?? null
      : null;

    const time = targetBlock?.startTime ?? (item.scheduledAt ? localTimeParts(new Date(item.scheduledAt)).time : '09:00');
    const newScheduledAt = localDateTimeToIso(today, time);
    const projected = role ? projectedLoadForRoleOnDate(today, role, item, newScheduledAt) : null;
    requestMove(item, newScheduledAt, projected);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Hoje</h1>
        <p className="min-h-6 capitalize text-gray-600">
          {mounted ? format(now, "EEEE, d 'de' MMMM", { locale: ptBR }) : ''}
        </p>
      </div>

      {pendingMove && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-medium">
            Você tem {formatMinutes(pendingMove.projected.plannedMinutes)} de trabalho planejado para{' '}
            {formatMinutes(pendingMove.projected.capacityMinutes)} de capacidade nesse dia/bloco.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void confirmPendingMove()}
              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              Mover mesmo assim
            </button>
            <button
              onClick={() => setPendingMove(null)}
              className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(allItemsError || projectsError) && (
        <div className="mb-6">
          <DataErrorNotice isOffline={isOffline} onRetry={refetchAllItems} />
        </div>
      )}

      <div className="space-y-6">
        <NowCard
          mounted={mounted}
          isBusinessDay={isBusinessDay(today)}
          currentBlock={currentBlock}
          nextBlock={nextBlock}
          roleProjectName={currentRoleProjectName}
          hasRoleAssignment={hasRoleAssignment}
          tasks={tasksInCurrentBlock}
          load={currentBlockLoad}
          minutesRemaining={minutesRemaining}
          learningSummary={learningToday ? { ...learningToday } : null}
          canMoveToNextCompatibleBlock={canMoveToNextCompatibleBlock}
          onComplete={handleComplete}
          onMoveNextCompatibleBlock={handleMoveNextCompatibleBlock}
          onMoveNextBusinessDay={handleMoveNextBusinessDay}
          onOpenDetail={openItemDetail}
        />

        <DayTimeline
          mounted={mounted}
          isBusinessDay={isBusinessDay(today)}
          blocks={blocks}
          nowTime={nowLocal}
          currentBlockId={currentBlock?.id ?? null}
          roleProjectNames={roleProjectNames}
          learningGoalMet={Boolean(learningToday?.goalMet)}
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <NextEventCard date={today} now={now} />
          <PendingItemsCard
            groups={pendingGroups}
            onComplete={handleComplete}
            onBringToToday={handleBringPendingToToday}
            onOpenDetail={openItemDetail}
          />
        </div>
      </div>
    </div>
  );
}
