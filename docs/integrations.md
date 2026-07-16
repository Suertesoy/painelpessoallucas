# Integrações (Preparação)

O Painel Pessoal Lucas é projetado para operar como um hub que se conecta com múltiplos serviços. Nenhuma integração direta com terceiros deve modificar repositórios diretamente.

## Contratos para Futuros Adaptadores
Serviços externos deverão se comunicar com o painel através dos **Commands** e **Queries** definidos na camada de Aplicação.

Futuros adaptadores previstos:
- **Google Calendar**: Para agendamentos e visualização na página "Agenda".
- **Gmail**: Para transformar e-mails em tarefas/insights.
- **Google Drive**: Para vinculação de referências a Projetos.
- **GitHub**: Para acompanhamento de PRs e issues vinculadas.
- **Vercel**: Status de deployments de projetos.

## Tratamento de Webhooks
Sistemas externos podem enviar webhooks para este painel. Toda rota que recebe um webhook deverá:
1. **Validar** a origem (assinaturas criptográficas/secrets).
2. **Registrar** a intenção.
3. Ser **Idempotente** (não duplicar ações se o webhook for entregue múltiplas vezes).
4. **Converter** a requisição em um Command interno ou Evento antes de processar qualquer alteração real.
