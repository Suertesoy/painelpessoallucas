// Este arquivo contém contratos (Interfaces) para a Fase 2,
// demonstrando como a IA será injetada no sistema sem acoplar a UI.

import { Item, ItemType } from '@/modules/items/domain/item.schema';

export interface TriagemInput {
  rawText: string;
  source: 'audio' | 'text' | 'email' | 'webhook';
}

export interface TriagemResult {
  suggestedTitle: string;
  suggestedContent: string;
  suggestedType: ItemType;
  suggestedPriority: 'low' | 'normal' | 'high' | 'critical';
  suggestedProjectId?: string;
  suggestedNextAction?: string;
  confidenceScore: number;
}

export interface AIProvider {
  /**
   * Analisa um texto bruto e sugere metadados estruturados.
   */
  triage(input: TriagemInput): Promise<TriagemResult>;

  /**
   * Gera um resumo executivo de um projeto com base em seus itens abertos e fechados.
   */
  summarizeProject(projectId: string, items: Item[]): Promise<string>;

  /**
   * Faz uma busca semântica (embeddings) nos itens existentes.
   */
  semanticSearch(query: string, threshold?: number): Promise<Item[]>;
}
