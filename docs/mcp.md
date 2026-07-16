# Model Context Protocol (MCP)

O sistema está preparado para atuar como um host/cliente MCP no futuro, mas o MCP não deve ser um substituto para APIs, webhooks, filas ou integrações determinísticas.

## Princípio Fundamental
O servidor MCP será apenas mais uma **porta de entrada** (Interface/Controller) e nunca deverá acessar ou modificar o banco de dados (Repositórios) diretamente. Todo acesso acontecerá utilizando as mesmas **Queries** e **Commands** consumidos pela interface web.

## Ferramentas Futuras Previstas
- `capture_item`: Captura rápida via agente.
- `create_task`: Criação estruturada de tarefas.
- `list_today`: Resumo de atividades do dia.
- `search_items` e `search_decisions`: Consultas semânticas/textuais.
- `get_project_context`: Recuperação de todos os metadados e itens de um projeto.
- `complete_task` e `schedule_task`: Operações de fluxo de trabalho.
- `register_insight`: Registro de insights inferidos pelo agente.
