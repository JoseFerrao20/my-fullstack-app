# Plano: vista Kanban e tarefas recorrentes

Ordem: primeiro o Kanban (só frontend, sem migração), depois as tarefas recorrentes (base de dados, backend e formulário).

## Parte 1: vista Kanban

**Para o utilizador**
- Seletor **Lista / Quadro** no topo; o quadro fica em `/board`.
- Três colunas: Por fazer, Em curso, Concluída, cada uma com contador.
- Arrastar um cartão para outra coluna muda o estado; clicar abre o formulário de edição existente.
- Filtros de prioridade, categoria e pesquisa partilhados com a lista (via URL). Sem filtro de estado: as colunas já são os estados.

**Backend**
- Só uma ordenação nova, `-completedAt`, para a coluna Concluída mostrar as mais recentes.

**Frontend** (`src/features/board/`)
- `BoardPage.tsx`: três pedidos, um por coluna, com `useTasks`.
  - Por fazer / Em curso: ordenadas por prioridade e prazo, até 100 cartões.
  - Concluída: as 20 mais recentes.
  - Link "+N na lista" quando há mais cartões do que os mostrados.
- `BoardColumn.tsx`, `TaskCard.tsx`: cartões compactos (título, prioridade, categoria, prazo, destaque se em atraso).
- `useMoveTask.ts`: `PATCH` do estado com atualização otimista e reversão em caso de erro.
- Arrastar e largar com `@dnd-kit/core`, com suporte de teclado, mais um menu "Mover para…" em cada cartão.
- A lógica de filtros sai de `TasksPage.tsx` para um hook partilhado, `useFilterParams`.

**Fora do âmbito:** reordenar cartões dentro da mesma coluna (precisaria de um campo de posição).

## Parte 2: tarefas recorrentes

**Para o utilizador**
- Campo **Repetir** no formulário: Nunca, Diariamente, Semanalmente, Mensalmente, e "a cada N".
- Uma tarefa recorrente exige prazo.
- Ao concluir, é criada a próxima tarefa (mesmo título, descrição, prioridade e categoria).
- Ícone ↻ com a regra nos cartões e na lista.
- Para parar: editar e escolher "Nunca".

**Base de dados** (migração `0002`, novas colunas em `tasks`)
- `recurrence`: enum `daily` / `weekly` / `monthly`, ou NULL.
- `recurrence_interval`: inteiro, 1 por omissão.
- `recurrence_timezone`: fuso IANA, por exemplo `Europe/Lisbon`.
- `next_occurrence_id`: ligação à tarefa seguinte, para não criar duplicados.

**Backend**
- `TaskCreate` / `TaskUpdate`: `recurrence`, `recurrenceInterval` (1 a 365), `recurrenceTimezone` (validado). Recorrência exige `dueAt`.
- `next_due_date()`: soma o intervalo ao prazo anterior, no fuso do utilizador.
  - Mantém a hora local através da mudança de hora (9:00 em Lisboa continua 9:00).
  - Usa `python-dateutil` para meses curtos (31 jan + 1 mês = 28 fev).
- `TaskService.update`: ao passar para `done`, se for recorrente e sem `next_occurrence_id`, cria a próxima e guarda a ligação. Desmarcar e voltar a marcar não duplica.
- Notificações: sem alterações; a tarefa nova é apanhada pelo job.

**Frontend**
- `TaskFormDialog` com os campos de repetição; fuso preenchido a partir do browser.
- Mensagem "Próxima: <data>" depois de concluir uma tarefa recorrente.

**Decisões tomadas**
1. O próximo prazo conta-se a partir do **prazo anterior**, não do dia em que se conclui.
2. Se a tarefa estiver muito atrasada, salta para a **primeira data futura** em vez de criar várias tarefas já vencidas.

## Testes
- **Backend:**
  - próximo prazo diário, semanal e mensal (31 jan, mudança de hora em Lisboa)
  - recuperar prazos em atraso
  - não duplicar ao concluir de novo
  - recorrência sem prazo dá 422
  - parar a recorrência
- **Frontend:**
  - o quadro mostra as três colunas
  - mover com o teclado envia o `PATCH`
  - o cartão volta atrás se o servidor der erro
  - o formulário envia os campos de recorrência
- **Final:** `docker compose up --build`, concluir uma tarefa semanal no quadro e ver a próxima em "Por fazer".
