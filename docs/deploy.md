# Guia de deploy

Como pôr a app a correr num servidor próprio (VPS), com HTTPS, email a sério e backups.
Tempo estimado na primeira vez: 30 a 45 minutos.

O que fica a correr no servidor (tudo em Docker, ficheiro `docker-compose.prod.yml`):

| Serviço    | O que faz                                                               |
|------------|-------------------------------------------------------------------------|
| `caddy`    | Único serviço exposto (portas 80/443). Trata do HTTPS automaticamente.  |
| `frontend` | nginx com a app React; reencaminha `/api` para o backend.               |
| `backend`  | FastAPI; aplica as migrações sozinho ao arrancar.                       |
| `db`       | PostgreSQL 16 (dados no volume `pgdata`).                               |
| `backup`   | Backup diário da base de dados às 03:15 UTC (7 diários + 4 semanais).   |

---

## 1. Criar o servidor

Qualquer VPS com Ubuntu serve. Exemplo com a **Hetzner Cloud** (cerca de 4 €/mês):

1. Criar conta em <https://console.hetzner.cloud> e um projeto.
2. **Add Server**:
   - Localização: Nuremberga ou Helsínquia (ou outra na UE).
   - Imagem: **Ubuntu 24.04**.
   - Tipo: **CX22** (2 vCPU, 4 GB RAM). Com 2 GB também funciona, mas ver o passo 3 (swap).
   - **SSH key**: colar a tua chave pública. No Windows, se ainda não tens uma:
     ```powershell
     ssh-keygen -t ed25519
     Get-Content $HOME\.ssh\id_ed25519.pub
     ```
3. Anotar o **endereço IPv4** do servidor (por exemplo `203.0.113.7`).

Entrar no servidor:

```bash
ssh root@203.0.113.7
```

## 2. Preparar o sistema

Tudo como `root`, no servidor.

```bash
# Atualizações (e atualizações de segurança automáticas)
apt update && apt upgrade -y
apt install -y unattended-upgrades git
dpkg-reconfigure -plow unattended-upgrades

# Docker (script oficial)
curl -fsSL https://get.docker.com | sh

# Utilizador próprio para a app (o deploy automático também entra com ele)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
```

> Estar no grupo `docker` dá ao utilizador `deploy` poderes equivalentes a root.
> É normal num servidor dedicado a esta app; apenas não o uses para mais nada.

### Firewall

Só precisamos de SSH (22) e da web (80/443):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
```

A base de dados e o backend não publicam portas, por isso não ficam acessíveis de fora
mesmo com o Docker a contornar o `ufw` (que só se aplica a portas publicadas).

### Desligar o login por password no SSH

Depois de confirmar que `ssh deploy@203.0.113.7` funciona com a chave:

```bash
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

### Só se o servidor tiver 2 GB de RAM: swap

O build do frontend pode precisar de mais memória:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Obter o código

```bash
mkdir -p /opt/taskapp && chown deploy:deploy /opt/taskapp
su - deploy
git clone https://github.com/JoseFerrao20/my-fullstack-app.git /opt/taskapp
cd /opt/taskapp
```

**Se o repositório for privado**, o servidor precisa de uma *deploy key* (só de leitura):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github -N ""
cat ~/.ssh/github.pub
```

Em GitHub → repositório → **Settings → Deploy keys → Add deploy key**, colar a chave
(sem marcar "Allow write access"). Depois:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github
EOF
git clone git@github.com:JoseFerrao20/my-fullstack-app.git /opt/taskapp
```

## 4. Configurar o email (Brevo)

1. Criar conta grátis em <https://www.brevo.com> (300 emails/dia).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: o endereço que vai
   aparecer no "De:" dos emails. A Brevo envia um email de confirmação.
3. **SMTP & API → SMTP**: gerar uma **SMTP key**. Anotar o *login* (algo como
   `8a1b2c001@smtp-brevo.com`) e a chave.

> Sem domínio próprio, o remetente tem de ser um endereço que já tens (ex.: Gmail).
> Funciona, mas alguns emails podem ir para o spam. Quando tiveres domínio, autentica-o
> na Brevo (**Domains → Add a domain**, registos DKIM/DMARC) e usa um remetente desse domínio.

## 5. Criar o `.env.production`

Ainda como `deploy`, em `/opt/taskapp`:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Preencher:

- **`DOMAIN`**: sem domínio próprio, o IP com hífenes seguido de `.sslip.io`.
  Para `203.0.113.7` fica `DOMAIN=203-0-113-7.sslip.io`. O sslip.io resolve esse nome para
  o teu IP, por isso o HTTPS funciona logo.
- **`JWT_SECRET`** e **`POSTGRES_PASSWORD`**: um valor aleatório diferente para cada um:
  ```bash
  openssl rand -base64 48
  ```
- **`SMTP_USER`**, **`SMTP_PASSWORD`**: login e SMTP key da Brevo.
- **`MAIL_FROM`**: o remetente verificado, ex.: `MAIL_FROM="Task Manager <o.teu.email@gmail.com>"`.
- **`VAPID_SUBJECT`**: `mailto:` + o teu email.

As chaves de push (opcionais; sem elas, as notificações no browser ficam desligadas) geram-se
depois de preencher o resto:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --no-deps backend python -m app.core.push
```

Copiar as duas linhas `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=` para o `.env.production`.

> **Guarda uma cópia do `.env.production` fora do servidor** (num gestor de passwords, por
> exemplo). Sem o `JWT_SECRET` todos têm de voltar a entrar; sem as chaves VAPID todos têm
> de voltar a ativar as notificações; sem a `POSTGRES_PASSWORD` os backups continuam
> utilizáveis, mas é mais trabalho.

## 6. Primeiro arranque

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

O primeiro build demora alguns minutos. Depois:

```bash
docker compose -f docker-compose.prod.yml ps
```

Todos os serviços devem estar `running` e o backend `healthy`. Abrir
`https://203-0-113-7.sslip.io` (o teu `DOMAIN`), criar conta e testar:

- criar uma tarefa;
- **Esqueci-me da password** → deve chegar um email com o link;
- **Definições → Notificações no browser** (se configuraste as chaves VAPID).

Se o backend não arrancar, os logs dizem porquê. Com `ENVIRONMENT=production` ele recusa
arrancar com configurações inseguras e lista o que falta corrigir:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

> Para não escrever sempre os ficheiros, pode criar-se um atalho (como `deploy`):
> ```bash
> echo "alias dc='docker compose -f /opt/taskapp/docker-compose.prod.yml --env-file /opt/taskapp/.env.production'" >> ~/.bashrc
> source ~/.bashrc
> ```
> A partir daqui, `dc ps`, `dc logs -f backend`, etc. O resto do guia usa `dc`.

## 7. Atualizar para uma versão nova

```bash
cd /opt/taskapp
sh deploy/update.sh
```

O script vai buscar o `main` mais recente, faz um backup da base de dados (as migrações
correm ao arrancar), reconstrói as imagens, reinicia e espera até o backend estar saudável.
Para instalar um commit específico (ex.: voltar atrás): `sh deploy/update.sh <commit>`.

> Voltar a um commit anterior não desfaz migrações já aplicadas. Se uma atualização tiver
> mudado a base de dados e for preciso voltar atrás, restaura também o backup feito pelo
> script mesmo antes da atualização (secção 9).

## 8. Logs e estado

```bash
dc ps                       # estado dos serviços
dc logs -f backend          # logs do backend em tempo real (Ctrl+C para sair)
dc logs --since 1h caddy    # pedidos e certificados HTTPS da última hora
docker stats --no-stream    # CPU e memória
```

Os logs rodam sozinhos (10 MB × 5 ficheiros por serviço).

## 9. Backups

O serviço `backup` faz um `pg_dump` todos os dias às 03:15 UTC. Guarda 7 diários e, aos
domingos, uma cópia semanal (guarda 4).

```bash
dc exec backup ls -lh /backups/daily /backups/weekly   # ver backups
dc exec backup sh /scripts/backup.sh                   # fazer um agora
```

### Restaurar

Substitui **todo** o conteúdo atual da base de dados pelo do backup:

```bash
dc stop backend
dc exec backup sh /scripts/restore.sh /backups/daily/<ficheiro>.dump
dc start backend
```

Sem argumento, `restore.sh` lista os backups disponíveis.

### Cópia fora do servidor (recomendado)

Os backups estão num volume do próprio servidor: se o servidor se perder, perdem-se também.
Para ter uma cópia noutro sítio, por exemplo no **Backblaze B2** (10 GB grátis):

1. Em <https://www.backblaze.com/cloud-storage>: criar conta, um *bucket* privado
   (ex.: `taskapp-backups`) e uma **Application Key** com acesso só a esse bucket.
2. Nas definições do bucket, **Lifecycle Settings**: "Keep only the last version" ou uma
   regra que apague ficheiros com mais de 30 dias.
3. No servidor, como `root`:
   ```bash
   apt install -y rclone
   rclone config create b2 b2 account <keyID> key <applicationKey>
   rclone lsd b2:   # deve mostrar o bucket
   ```
4. Copiar todos os dias, a seguir ao backup (`crontab -e` como `root`):
   ```
   45 3 * * * rclone copy /var/lib/docker/volumes/taskapp-prod_backups/_data b2:taskapp-backups --max-age 48h
   ```

Usamos `copy` (e não `sync`) para que apagar algo no servidor não apague a cópia remota;
é a regra de lifecycle do bucket que limpa os antigos.

**Restaurar a partir do B2** (ex.: num servidor novo, depois dos passos 1–6):

```bash
rclone copy b2:taskapp-backups/daily/<ficheiro>.dump /tmp/
dc cp /tmp/<ficheiro>.dump backup:/backups/daily/
dc stop backend
dc exec backup sh /scripts/restore.sh /backups/daily/<ficheiro>.dump
dc start backend
```

## 10. Deploy automático (opcional)

O workflow `.github/workflows/deploy.yml` atualiza o servidor sozinho sempre que o CI passa
no `main` (ou seja, depois de cada merge de um PR). Instala exatamente o commit que o CI
testou, através de `deploy/update.sh`. Enquanto os segredos abaixo não existirem, não faz
nada.

1. **Chave SSH só para o GitHub.** No teu computador:
   ```powershell
   ssh-keygen -t ed25519 -f $HOME\.ssh\taskapp_deploy -N '""' -C "github-actions-deploy"
   ```
   Adicionar a chave **pública** ao servidor:
   ```bash
   # no servidor, como deploy
   echo "<conteúdo de taskapp_deploy.pub>" >> ~/.ssh/authorized_keys
   ```
2. **Impressão digital do servidor** (para o GitHub não se ligar a outra máquina):
   ```bash
   ssh-keyscan 203.0.113.7
   ```
3. Em GitHub → repositório → **Settings → Environments → New environment** chamado
   `production`. Lá dentro, **Add environment secret**:

   | Segredo              | Valor                                                    |
   |----------------------|----------------------------------------------------------|
   | `DEPLOY_HOST`        | IP do servidor, ex.: `203.0.113.7`                        |
   | `DEPLOY_USER`        | `deploy`                                                 |
   | `DEPLOY_SSH_KEY`     | conteúdo **privado** de `taskapp_deploy` (o ficheiro sem `.pub`) |
   | `DEPLOY_KNOWN_HOSTS` | o resultado completo do `ssh-keyscan`                    |
   | `DEPLOY_PATH`        | só se não usaste `/opt/taskapp`                           |

   No mesmo ecrã podes ativar **Required reviewers** se quiseres aprovar cada deploy à mão.
4. Testar: **Actions → Deploy → Run workflow**.

Recomendado: em **Settings → Branches**, proteger o `main` com "Require status checks to
pass" (jobs `backend`, `frontend` e `e2e`), para que nada chegue ao `main` (e à produção)
sem o CI verde.

## 11. Passar para um domínio próprio

1. Comprar o domínio (ex.: Cloudflare Registrar, Namecheap, PTisp para `.pt`).
2. No DNS do domínio, criar um registo **A** a apontar para o IP do servidor
   (ex.: `tarefas.exemplo.pt → 203.0.113.7`). Se usares Cloudflare, deixa a nuvem
   **cinzenta** ("DNS only") para o Caddy conseguir o certificado.
3. Esperar que o nome resolva (`ping tarefas.exemplo.pt` mostra o teu IP).
4. Alterar `DOMAIN=tarefas.exemplo.pt` no `.env.production` e aplicar:
   ```bash
   dc up -d
   ```
   O Caddy obtém o certificado novo sozinho.
5. Na Brevo, autenticar o domínio e mudar `MAIL_FROM` para um endereço dele
   (ver a nota da secção 4), seguido de outro `dc up -d`.

O que muda para os utilizadores com a mudança de endereço:

- têm de **voltar a entrar** (os cookies pertencem ao endereço antigo);
- têm de **voltar a ativar as notificações no browser** (as subscrições também);
- os **links de calendário (iCal)** antigos deixam de funcionar: cada um gera um novo em
  Definições;
- os links nos emails já enviados (ex.: recuperar password) apontam para o endereço antigo.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| O browser diz que o certificado é inválido | O `DOMAIN` não resolve para este servidor, ou as portas 80/443 estão fechadas. Ver `dc logs caddy`. |
| `dc ps` mostra o backend a reiniciar | `dc logs backend`: normalmente "Refusing to start in production" com a lista do que corrigir. |
| `Set X in .env.production` ao correr `dc` | Falta essa variável no `.env.production`. |
| Os emails não chegam | Remetente não verificado na Brevo ou SMTP key errada; ver `dc logs backend`. Ver também a pasta de spam. |
| "Too many attempts" ao entrar | Proteção contra ataques: 5 falhas por email+IP em 15 min. Esperar. |
| O build é morto a meio (`Killed`) | Falta de memória: ativar swap (passo 2). |
