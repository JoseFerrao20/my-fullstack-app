# Plano: conta, sessões, português e vistas "Hoje"

Ordem: sessões → português → email e conta → vistas "Hoje". Tabelas novas na migração `0003`.

## 1. Sessões revogáveis e limite de tentativas
- Tabela `sessions` (`id`, `user_id`, hash do refresh token atual, `user_agent`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`). Os tokens levam o id da sessão (`sid`).
- `get_current_user` verifica que a sessão não foi revogada: o logout corta o acesso logo.
- Rotação do refresh token em cada `/auth/refresh`; reutilizar um token antigo revoga a sessão.
- `POST /auth/logout` revoga a sessão atual; `POST /auth/logout-all` revoga todas.
- Limite de tentativas (tabela `rate_limit_events`): login 5 falhas por email+IP e 20 por IP em 15 min → 429 com `Retry-After`; recuperação de password 3 por email por hora.
- uvicorn com `--proxy-headers` para ver o IP real atrás do nginx.
- Tarefa diária de limpeza (sessões expiradas, eventos antigos, tokens usados).
- Fora do âmbito: proteção CSRF explícita.

## 2. Interface em português (PT/EN)
- `react-i18next`, `src/locales/pt.json` e `en.json` por funcionalidade.
- Língua: a do browser por omissão; escolhida nas definições e guardada em `users.locale` (vale também para os emails).
- Textos via `t()`; etiquetas de estado/prioridade/repetição como chaves; datas na língua escolhida.
- Erros do servidor traduzidos pelo `code`.
- Notificações montadas no frontend a partir do tipo + `taskTitle` (novo campo na API).
- Testes existentes continuam em inglês; testes novos confirmam o português.

## 3. Email e gestão da conta
- `core/email.py` (SMTP, em segundo plano); Mailpit no docker-compose (http://localhost:8025); caixa de saída em memória nos testes.
- Recuperar password: `POST /auth/password-reset/request` (responde sempre 202), link de 1 hora e uso único (só o hash é guardado em `password_reset_tokens`); `POST /auth/password-reset/confirm` muda a password e termina todas as sessões. **Depois vai para o login** com "Password alterada".
- `/settings`: `PATCH /auth/me` (nome, língua), `POST /auth/password` (termina as outras sessões), `DELETE /auth/me` (confirma com a password), "Terminar sessão em todos os dispositivos".
- Ecrãs: "Esqueceu-se da password?", `/forgot-password`, `/reset-password`, `/settings`.

## 4. Vistas "Hoje" e "Próximos 7 dias"
- Backend: filtro `excludeDone=true`.
- O browser calcula os limites do dia local.
- `/today`: secções Atrasadas e Hoje. **Passa a ser a página inicial depois do login.**
- `/upcoming`: próximos 7 dias agrupados por dia.
- Menu: Hoje · Próximos · Todas · Definições, com contador em "Hoje".

## Testes
- Backend: logout imediato, rotação e reutilização de refresh token, `logout-all`, 429, recuperação (não revela emails, expira, uso único, termina sessões), mudar password, apagar conta, língua, `taskTitle`.
- Frontend: recuperação, definições, troca de língua, limites do dia em "Hoje", agrupamento em "Próximos", mensagem 429.
- Final: recuperação de password de ponta a ponta com o Mailpit, e a sessão noutro browser a terminar.
