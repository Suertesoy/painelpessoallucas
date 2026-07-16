// Este arquivo contém contratos para a Fase 2,
// demonstrando como o Model Context Protocol (MCP) será suportado.

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown; // Zod schema ou JSON schema
}

export interface MCPToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface MCPRegistry {
  /**
   * Registra uma ferramenta que os agentes externos poderão chamar.
   * Exemplo: registerTool({ name: 'create_project', ... })
   */
  registerTool(definition: MCPToolDefinition, handler: (args: unknown) => Promise<MCPToolResult>): void;

  /**
   * Retorna todas as ferramentas registradas para expor no servidor MCP.
   */
  getRegisteredTools(): MCPToolDefinition[];

  /**
   * Executa uma ferramenta solicitada por um agente externo.
   */
  executeTool(call: MCPToolCall): Promise<MCPToolResult>;
}
