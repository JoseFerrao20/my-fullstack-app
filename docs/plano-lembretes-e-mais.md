# Plano: lembretes, subtarefas, adição rápida, calendário e mais

Branch `feature/reminders-and-more`. Uma parte de cada vez, com paragem e commit no fim de cada uma.
A colaboração (projetos partilhados) fica para uma ronda própria.

## Parte 1: Lembretes, push do browser e resumo diário
- **Por tarefa:** campo "Lembrar-me" (no prazo, 5/15/30 min, 1 h, 2 h, 1 dia antes). Exige prazo.
- **Entrega:** notificação na app (novo tipo `reminder`), email e push do browser, conforme as preferências.
- **Resumo diário por email:** tarefas em atraso e de hoje, à hora escolhida no fuso do utilizador; só quando há tarefas.
- **Preferências** (Definições → Notificações): lembretes por email, push neste dispositivo, resumo diário e a hora.
- **Backend:** funcionalidade nova `features/reminders/` (preferências, subscrições push, envio); tarefas no agendador
  (lembretes a cada minuto, resumo a cada 5 min); Web Push com `pywebpush` e chaves VAPID (sem chaves, o push fica desligado).
- **Frontend:** service worker (`public/sw.js`) que mostra o push e abre a tarefa ao clicar.

## Parte 2: Subtarefas (checklist)
- Lista de passos dentro de cada tarefa: adicionar, marcar, editar, reordenar e apagar.
- Progresso "3/5" na lista, no quadro e nas vistas Hoje/Próximos.

## Parte 3: Adição rápida em linguagem natural (PT/EN)
- Uma caixa "Adicionar tarefa…" que entende `Pagar renda dia 1 todos os meses #casa !alta`:
  datas ("amanhã", "sexta", "dia 1", "às 9h"), repetição ("todos os meses"), `#categoria` e `!prioridade`.
- Mostra o que percebeu antes de criar; tudo editável.

## Parte 4: Vista de calendário
- Mês e semana; arrastar uma tarefa para outro dia muda o prazo (mantendo a hora).

## Parte 5: Etiquetas, modo escuro, lixo com "Desfazer" e feed iCal
- **Etiquetas:** várias por tarefa, com filtro.
- **Modo escuro:** segue o sistema, com opção nas definições.
- **Lixo:** apagar move para o lixo 30 dias, com "Desfazer" logo a seguir; página do lixo para restaurar.
- **Feed iCal:** um URL privado (revogável) para subscrever as tarefas no Google Calendar ou no Outlook.
