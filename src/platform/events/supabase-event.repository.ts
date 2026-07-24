'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { EventRepository } from './event.repository';
import { DomainEvent, DomainEventSchema } from './event.schema';

/**
 * Eventos de domínio no Supabase (append-only).
 *
 * Limitação registrada: a entidade e o evento são gravados em duas operações
 * (não há transação client-side no PostgREST). A falha na gravação do evento
 * é registrada no console mas não desfaz o command — o evento é registro de
 * auditoria, não fonte de verdade. A outbox transacional (RPC) fica documentada
 * como evolução futura em docs/events.md.
 */
export class SupabaseEventRepository implements EventRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string
  ) {}

  async save(event: DomainEvent): Promise<void> {
    const { error } = await this.supabase.from('domain_events').insert({
      id: event.id,
      workspace_id: event.workspaceId,
      type: event.type,
      entity_id: event.entityId,
      source: event.source,
      payload: event.payload ?? null,
      created_at: event.createdAt,
      processed_at: event.processedAt ?? null,
    });
    if (error) {
      // Evento é auditoria: não derruba a operação principal.
      console.error('Falha ao registrar evento de domínio', error.message);
    }
  }

  async findAll(): Promise<DomainEvent[]> {
    const { data, error } = await this.supabase
      .from('domain_events')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      throw new Error(`Não foi possível carregar os eventos: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      DomainEventSchema.parse({
        id: row.id,
        type: row.type,
        entityId: row.entity_id,
        workspaceId: row.workspace_id,
        source: row.source,
        payload: row.payload ?? undefined,
        createdAt: row.created_at,
        processedAt: row.processed_at ?? undefined,
      })
    );
  }

  async findMigrationCompletedAt(): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('domain_events')
      .select('created_at')
      .eq('workspace_id', this.workspaceId)
      .eq('type', 'migration.completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível verificar o histórico de migração: ${error.message}`);
    }
    return data?.created_at ?? null;
  }

  async findByEntityId(entityId: string): Promise<DomainEvent[]> {
    const { data, error } = await this.supabase
      .from('domain_events')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      throw new Error(`Não foi possível carregar o histórico do item: ${error.message}`);
    }
    return (data ?? []).map((row) =>
      DomainEventSchema.parse({
        id: row.id,
        type: row.type,
        entityId: row.entity_id,
        workspaceId: row.workspace_id,
        source: row.source,
        payload: row.payload ?? undefined,
        createdAt: row.created_at,
        processedAt: row.processed_at ?? undefined,
      })
    );
  }
}
