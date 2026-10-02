# Plano: pôr a app em produção

Escolhas: servidor próprio (VPS), domínio mais tarde, envio de email real. Branch novo; uma parte de cada vez, com paragem no fim.

## Parte A: CI no GitHub Actions
- **Linters:** Ruff no backend, ESLint no frontend (configurações e correções do que apontarem).
- **Workflow `ci.yml`** em cada push e PR:
  - backend: Postgres como serviço, `ruff`, `pytest`;
  - frontend: `npm ci`, ESLint, `tsc`, `vitest`, `build`;
  - build das imagens Docker (para apanhar Dockerfiles partidos).
- O PR mostra se está tudo verde antes do merge.

## Parte B: Testes de ponta a ponta com Playwright
- Num browser real (Chromium), contra a app completa em Docker (`docker compose`), também no CI.
- Fluxos: registo → adição rápida → concluir; arrastar no quadro e no calendário; recuperar password lendo o email no Mailpit; mudar para modo escuro; ativar o push (só a parte do browser: o serviço de push real não é alcançável no CI).

## Parte C: Configuração de produção
- `docker-compose.prod.yml`:
  - **Caddy** à frente, com HTTPS automático (Let's Encrypt).
  - Sem domínio ainda: o endereço `<IP-do-servidor>.sslip.io` aponta para o servidor e permite HTTPS desde o primeiro dia. Trocar para um domínio próprio é mudar uma variável.
  - Base de dados e backend sem portas públicas; só o Caddy (80/443) está exposto.
  - Imagens sem dependências de desenvolvimento; `restart: unless-stopped`; limites de logs.
- **Segurança:** em produção (`ENVIRONMENT=production`) o backend recusa arrancar com a chave JWT de desenvolvimento ou com cookies não seguros.
- **Email real:** SMTP de um serviço como o **Brevo** (gratuito até 300 emails/dia, empresa europeia) — só variáveis de ambiente.
- **Backups:** `pg_dump` diário para um volume, com rotação (7 diários, 4 semanais), e um script de restauro testado.

## Parte D: Deploy e guia
- `docs/deploy.md` em português, passo a passo: criar o servidor (ex.: Hetzner), instalar Docker, firewall, `.env` de produção, primeiro arranque, atualizar, restaurar um backup, ligar um domínio próprio mais tarde.
- **Deploy automático (opcional):** um workflow que, ao fazer merge no `main` com o CI verde, entra no servidor por SSH e atualiza a app.
