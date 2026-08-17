# SOS Mendonça — Contexto do Projeto

Documento único de referência. Se estiveres a retomar o trabalho, começa aqui.

Última atualização: agosto de 2026

---

## 1. O que é

Sistema de apoio a pessoas idosas que vivem sozinhas. Uma app no telemóvel do
idoso, um servidor num Raspberry Pi em casa, e um painel web para os familiares.

Quando algo corre mal — a pessoa carrega no SOS, cai, fica sem bateria, ou
simplesmente deixa de dar sinal — a família fica a saber em segundos.

**Uso familiar, não comercial.** Sem Play Store, sem contas de terceiros, sem
dados a sair de um servidor que é da própria família.

### Quem usa

| Pessoa | O que vê | Onde |
|---|---|---|
| Idoso | App simples: um botão grande, contactos, estado | Telemóvel Android próprio |
| Cuidador | Painel: estado, mapa, alertas, histórico | Browser ou PWA no telemóvel |

---

## 2. Repositório

**Um único repositório**, chamado `SOS-Mendonca`, privado.

```
SOS-Mendonca/
├── app/                    App Expo (telemóvel do idoso)
├── server/                 API + WebSocket  ← o que corre no Pi
│   ├── src/
│   └── public/             build do dashboard (gerado)
├── dashboard/              Vite + React (painel do cuidador)
├── skills/                 Skills para a app Claude
├── .claude/agents/         Agentes para o Claude Code
├── CLAUDE.md               regras que o Claude Code carrega sempre
├── ROADMAP.md              lista de funcionalidades por fazer, com prioridade
└── Context.md              este ficheiro
```

Servidor e app partilham o contrato da API — mudar o formato de um alerta tem
de alterar os dois lados no mesmo commit. Daí o repositório único.

No Pi corre **um só container**: `docker compose -f compose.yaml up -d`. O
dashboard compilado são ficheiros estáticos servidos pelo próprio Express, o que
evita CORS, evita um segundo túnel e evita um segundo processo para manter vivo.
O `restart: unless-stopped` faz o que o PM2 fazia — sobrevive a reinícios do Pi.

A base de dados continua a ser um ficheiro SQLite, bind-mounted de
`server/data/` no host: o backup é copiar um ficheiro e sobrevive a um
`docker compose down -v`. Postgres foi considerado e recusado — para uma pessoa
e um telemóvel, seria um segundo daemon que tem de estar vivo para que um
ficheiro possa ser um servidor, e mais uma coisa a falhar às 3 da manhã.

Privado porque contém o domínio do túnel, o nome do pacote e eventualmente a
licença da Transistor. O `.gitignore` já cobre `.env`, `data/` e `node_modules`.

---

## 3. Arquitetura

```
┌──────────────────────────┐         ┌───────────────────────────────┐
│  App Expo                │         │  Raspberry Pi                 │
│  telemóvel do idoso      │         │                               │
│                          │ HTTPS   │  ┌─────────────────────────┐  │
│  • Botão SOS             ├────────►│  │ API REST (Express + TS) │  │
│  • Foreground service    │         │  ├─────────────────────────┤  │
│  • Deteção de queda      │  WSS    │  │ WebSocket (tempo real)  │  │
│  • Bateria / offline     │◄───────►│  ├─────────────────────────┤  │
│  • Contactos emergência  │         │  │ SQLite (better-sqlite3) │  │
└──────────────────────────┘         │  ├─────────────────────────┤  │
                                     │  │ dashboard estático      │  │
┌──────────────────────────┐  WSS    │  └─────────────────────────┘  │
│  Cuidador (PWA/browser)  │◄───────►│  Cloudflare Tunnel            │
└──────────────────────────┘         └───────────────────────────────┘
```

### Fluxo de um SOS

1. Idoso carrega no botão (ou a deteção de queda dispara, com 30 s para cancelar)
2. Vibração imediata — confirma que o toque registou
3. **Chamada telefónica** ao contacto primário, sem passar pelo marcador
4. Em paralelo: obter GPS e `POST /api/v1/device/alerts`
5. Servidor grava, difunde por WebSocket, envia push FCM
6. Cuidador confirma no painel — fica registado quem tratou e quando

---

## 4. Stack

| Camada | Escolha | Porquê |
|---|---|---|
| App | Expo + development builds (CNG) | Config plugins tratam do nativo; EAS Update corrige sem reinstalar |
| Localização | `react-native-background-geolocation` (Transistor) | Ver secção 9 — `expo-location` tem um bug grave aqui |
| Sensores / push / intents | `expo-sensors`, `expo-notifications`, `expo-intent-launcher` | |
| Chamada direta | `react-native-immediate-phone-call` | `Linking` só abre o marcador, não liga |
| Backend | Node.js + TypeScript + Express | Mesma linguagem em todo o lado, leve para o Pi |
| Base de dados | SQLite via `better-sqlite3` | Zero manutenção; migra para Postgres se algum dia crescer |
| Tempo real | `ws` | Simples e suficiente |
| Validação | `zod` | |
| Dashboard | Vite + React + Leaflet + OpenStreetMap | Sem chaves de API, sem custos |
| Push | Firebase Cloud Messaging | Único caminho fiável no Android |
| Exposição | Cloudflare Tunnel (ou Tailscale) | Sem abrir portas, TLS incluído, resolve IP dinâmico |
| Processo | PM2 | Sobrevive a reinícios do Pi |

O painel do cuidador é **PWA**, não app nativa. Instala-se a partir do browser,
fica com ícone no ecrã inicial e recebe Web Push no Android. Uma app para manter
em vez de duas. No iOS o Web Push exige adicionar mesmo ao ecrã inicial e é
historicamente menos fiável — testa cedo se algum cuidador for de iPhone.

---

## 5. Os seis princípios

Estes orientam as decisões todas. Quando houver dúvida, é aqui que se resolve.

**1. O silêncio é um alerta.** Um telemóvel que deixa de reportar pode ser uma
pessoa caída. O servidor tem watchdog para isso, e o painel mostra-o com o pulso
a apagar-se.

**2. No SOS, a chamada vem antes da rede de dados.** A rede de voz funciona onde
os dados falham, e a pessoa precisa de ouvir alguém — não de saber que um
servidor recebeu um JSON. Nunca metas um `await` de localização antes da chamada.

**3. Tudo funciona offline e reenvia depois.** A rede vai falhar. Fila local
persistente, envio em lote, limpar só em caso de sucesso.

**4. Alertar de mais é falhar.** Alertas repetidos treinam as pessoas a
ignorá-los, e depois ninguém atende quando é a sério. Alertas automáticos levam
janela anti-spam; o SOS nunca é suprimido.

**5. Cuidado consentido, não vigilância.** A app é visível: ícone no launcher,
notificação permanente, ecrã "O que é partilhado". O RGPD aplica-se mesmo entre
familiares.

**6. A app é inútil se o Android a matar.** Antes de acrescentar
funcionalidades, verifica se a fundação aguenta.

---

## 6. Base de dados

SQLite, ficheiro em `server/data/sos.db`, modo WAL.

| Tabela | Conteúdo |
|---|---|
| `caregivers` | email, hash bcrypt, nome, token FCM |
| `devices` | nome, hash do token, código de emparelhamento, bateria, `last_seen_at` |
| `locations` | device_id, lat, lon, precisão, bateria, `recorded_at`, `received_at` |
| `alerts` | device_id, tipo, coordenadas, nota, quem confirmou e quando |
| `emergency_contacts` | device_id, nome, telefone, prioridade |

Tipos de alerta: `sos`, `fall`, `low_battery`, `device_offline`, `geofence`.

### Duas colunas de tempo, e a diferença importa

`recorded_at` é a hora no telemóvel — é a que interessa ao cuidador.
`received_at` é a hora de chegada ao servidor. Divergem quando a fila offline
reenvia um lote. **Ordena sempre por `recorded_at DESC`**; ordenar pela outra
mostra o percurso trocado.

### Alterar o esquema

`db.ts` usa `CREATE TABLE IF NOT EXISTS`, portanto colunas novas em tabelas que
já existem **não aparecem** só por editares o ficheiro:

```ts
const cols = db.prepare(`PRAGMA table_info(devices)`).all() as { name: string }[];
if (!cols.some(c => c.name === 'nova_coluna')) {
  db.exec(`ALTER TABLE devices ADD COLUMN nova_coluna TEXT`);
}
```

---

## 7. API

### Autenticação — dois mundos separados

Confundir isto é o erro mais fácil de cometer neste código.

| | Dispositivo (idoso) | Cuidador (painel) |
|---|---|---|
| Credencial | Token opaco de 64 hex | JWT, 30 dias |
| Como se obtém | Emparelhamento por código de 6 dígitos | Email + palavra-passe (bcrypt) |
| Guardado como | Só o hash SHA-256 na BD | Nada; é assinado |
| Middleware | `requireDevice` | `requireCaregiver` |
| Rotas | `/api/v1/device/*` | `/api/v1/*` |

**O telemóvel nunca faz login.** Se te vires a escrever um ecrã de palavra-passe
na app do idoso, algo correu mal no desenho.

### Endpoints

**Dispositivo:**
```
POST /api/v1/device/pair          { code }              → { token, device }
POST /api/v1/device/locations     ponto ou array        → { saved }
POST /api/v1/device/alerts        { type, lat, lon }    → { id }
POST /api/v1/device/heartbeat     { battery_pct }       → { ok }
PUT  /api/v1/device/contacts      [{ name, phone, priority }]
```

**Cuidador:**
```
POST /api/v1/auth/register        (fecha após o primeiro utilizador)
POST /api/v1/auth/login           → { token, name }
POST /api/v1/devices              { name } → { pairing_code }
GET  /api/v1/devices              lista + última posição
GET  /api/v1/devices/:id/locations?hours=24
GET  /api/v1/devices/:id/contacts
GET  /api/v1/alerts?open=true
POST /api/v1/alerts/:id/ack
PUT  /api/v1/me/fcm-token
```

**WebSocket:** `/ws?token=<jwt>`. Eventos `hello`, `location`, `alert`.
Ping de 30 em 30 s para atravessar o túnel; o cliente religa com espera
crescente até 30 s.

### Convenções ao adicionar endpoints

- Valida com Zod antes de tocar na base de dados; nunca passes `req.body` direto
- `db.prepare` com placeholders `?`, nunca interpolação em SQL
- Escritas múltiplas em `db.transaction(() => {...})()` — repara nos parênteses
  finais, o `better-sqlite3` devolve uma função
- Todo o alerta novo chama `broadcast()` a seguir ao INSERT
- Alertas automáticos levam anti-spam (bateria 1 h, offline 6 h)
- Termina com `npx tsc --noEmit` e um teste em curl que inclua o caminho de
  falha, não só o caso feliz

---

## 8. App — permissões e sobrevivência

### Ordem de pedido (a única que funciona)

1. `POST_NOTIFICATIONS`
2. `ACCESS_FINE_LOCATION` → a pessoa escolhe "Enquanto usa a app"
3. **Ecrã separado com explicação**, e só depois `ACCESS_BACKGROUND_LOCATION` →
   abre as definições do sistema, onde tem de escolher "Permitir sempre"
4. `CALL_PHONE`
5. Isenção de otimização de bateria via `expo-intent-launcher`

Pedir tudo de uma vez faz o Android negar em silêncio, sem mostrar nada.

### Permissões completas

`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `CALL_PHONE`,
`READ_CONTACTS`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`,
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `VIBRATE`, `INTERNET`.

Todas declaradas em `app.json`, nunca no AndroidManifest — com CNG, `android/` é
gerado e as edições manuais desaparecem no próximo `prebuild --clean`.

### Sobreviver aos fabricantes

Samsung, Xiaomi, Huawei e Oppo matam serviços em segundo plano de forma muito
mais agressiva do que o Android puro. Defesa em camadas:

| Camada | O quê |
|---|---|
| Foreground service | `foregroundServiceType="location"` + notificação permanente |
| Isenção de bateria | Intent para as definições, no onboarding |
| Autostart | Só manual (Xiaomi/Oppo) — guia com capturas de ecrã |
| Watchdog local | `AlarmManager` de 15 em 15 min, relança o serviço |
| Boot receiver | O telemóvel vai reiniciar sozinho |
| **Watchdog no servidor** | Sem contacto há 30 min → alerta `device_offline` |

A última camada é a que salva o sistema quando as outras falham. Nunca a retires
para "reduzir falsos positivos" — um telemóvel silencioso é exatamente a
situação que queremos detetar.

---

## 9. Armadilhas conhecidas

**`expo-location` não serve para o seguimento contínuo.** Há um defeito aberto
(SDK 56/57) em que o foreground service congela depois de qualquer atualização
da app, incluindo OTA: a notificação continua no ecrã, nenhuma localização
chega, e só um encerramento forçado recupera. Num telemóvel no bolso de alguém
que nunca vai forçar o encerramento de nada, isto é falha silenciosa total.
Usa o SDK da Transistor, que gere o próprio serviço e trata de `startOnBoot` e
`stopOnTerminate`. Continua a servir para leituras pontuais (o GPS do SOS).

**Licença da Transistor.** Exigida em builds de release; builds de debug
funcionam sem ela. Para uso familiar, um debug build com o bundle JS embutido é
saída legítima — APK maior e mais lento, mas funcional e legal.

**A keystore.** Perdê-la significa que nenhuma atualização futura instala por
cima: tens de desinstalar o telemóvel da avó e perder a configuração toda. Se
usares EAS, faz `eas credentials` e exporta uma cópia.

**OTA só atualiza JavaScript e assets.** Bibliotecas nativas, permissões ou
config plugins exigem APK novo instalado à mão. Cada OTA reinicia o processo —
**confirma sempre que o seguimento voltou depois de publicar**. Publica primeiro
num canal de teste, no teu telemóvel: uma OTA má chega a toda a gente ao mesmo
tempo e não há como recuar remotamente se a app deixar de arrancar.

**Compatibilidade de versões.** A app antiga fica no telemóvel semanas, porque
não controlas quando a pessoa atualiza. O servidor aceita sempre versões
antigas: adiciona campos, nunca lhes mudes o significado. Se precisares mesmo de
quebrar algo, cria `/api/v2` e mantém o `v1` até confirmares que ninguém o usa.
Envia `X-SOS-App-Version` em todos os pedidos para saberes que versão cada
telemóvel corre.

---

## 10. Interface

### Para o idoso

Desenhar para alguém de 80 anos não é desenhar igual com letras maiores.

- **Toque:** mínimo 60 dp; o SOS 100 dp ou mais
- **Texto:** base 22 sp, botões principais 26 sp+, nunca abaixo de 18 sp
- **Contraste:** mínimo 7:1 (WCAG AAA), não 4.5:1. Nada de cinzento sobre branco
- **Uma ação por ecrã.** Dois botões de igual peso fazem a pessoa hesitar
- **Ícones nunca sozinhos** — sempre ícone + palavra
- **Sem gestos.** Nada de deslizar, arrastar, toque longo ou duplo
- **Sem temporizadores.** O que aparece fica até a pessoa decidir
- **Retorno em menos de 100 ms** ao toque, senão a pessoa toca três vezes
- **SOS:** contagem de 3 s com anel visível a preencher, não um diálogo de
  "Sim/Não" em letras pequenas
- **Confirmação por três canais:** visual, vibração e som — um deles pode estar
  indisponível

Linguagem: "Não consegui ligar-me. Vou tentar outra vez." em vez de "Erro de
autenticação". Sem termos técnicos, sem metáforas de computador, sem humor.
Trata por "você", nunca infantilizes.

### Painel do cuidador

Paleta tirada do azulejo português — azul de tinta sobre parede caiada. A ideia
é uma casa, não um painel de frota. Calmo por definição, alto só quando é preciso.

```
--tinta:       #14304A    texto e estrutura
--tinta-suave: #4A6480    secundário
--parede:      #E9EDEF    fundo
--louca:       #FFFFFF    superfícies
--azulejo:     #2F6F9E    acento
--musgo:       #3F7A5A    tudo bem
--alarme:      #C4362C    alerta
--areia:       #DED6C8    linhas
```

Tipos: **Fraunces** (display), **IBM Plex Sans** (corpo), **IBM Plex Mono**
(horas e coordenadas).

O herói é uma frase, não um gráfico: *"A Maria está bem."* Quem abre isto às 3
da manhã quer uma resposta em palavras antes de qualquer dado.

O elemento assinatura é **o pulso**: um ponto que respira a cada sinal recebido
do telemóvel. Quando os sinais param, para de respirar e apaga. O silêncio
passa a ser visível.

---

## 11. Privacidade e enquadramento legal

Desenhado como app de cuidado consentido:

- Visível: ícone no launcher e notificação permanente do serviço
- Ecrã "O que é partilhado" acessível no telemóvel do idoso
- O idoso pode ver o histórico do que foi enviado

Não é só ética. Em Portugal o RGPD aplica-se mesmo entre familiares, e uma app
oculta a ler comunicações de um adulto capaz é juridicamente problemática. Se
houver incapacidade declarada, deve existir representante legal.

**Leitura de SMS está fora do âmbito, por decisão.** `READ_SMS` é a permissão
mais sensível do Android, tem pouco valor prático para segurança (localização e
SOS dão muito mais) e transformaria o projeto num produto diferente. O caso de
uso real costuma ser deteção de burlas por SMS/chamada/apps de acesso remoto —
essa conversa já aconteceu e a decisão está detalhada no `ROADMAP.md` §0:
deteção local no telemóvel, alerta no painel, nunca o conteúdo.

---

## 12. Correr o projeto

### Servidor e dashboard (Docker Compose)

Uma vez, para criar o `.env`:

```bash
cp server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # → JWT_SECRET
```

Depois, na raiz do repositório:

```bash
docker compose up -d --build   # servidor + painel, com hot reload nos dois
docker compose logs -f server
docker compose down
```

| | Onde |
|---|---|
| API | `localhost:3100` |
| Painel (Vite dev) | `localhost:5173` |

**Porquê 3100 e não 3000:** nesta máquina de desenvolvimento a 3000 já está
tomada por outro projeto. O remapeamento vive no `compose.override.yaml`; no Pi
vale o `compose.yaml` sozinho, onde a porta é a 3000.

**Porquê polling:** os eventos de ficheiro do Windows não atravessam a partilha
do Docker Desktop, por isso o servidor corre `dev:poll` (nodemon
`--legacy-watch`) e o Vite leva `usePolling`. Sem isto o ficheiro chega
actualizado ao container mas nada recarrega. Em Linux nativo não seria preciso.

Criar o primeiro cuidador (o registo fecha a seguir):

```bash
curl -X POST http://localhost:3100/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"eu@exemplo.pt","password":"...","name":"Eu"}'
```

Sem Docker também corre: `cd server && npm install && npm run dev`, e
`cd dashboard && npm install && npm run dev`.

### App

```bash
cd app
npx expo install
npx expo run:android    # development build no dispositivo
eas update --branch producao --message "..."
```

### No Pi

```bash
git pull
docker compose -f compose.yaml up -d --build
cloudflared tunnel --url http://localhost:3000
```

O `-f compose.yaml` é obrigatório: sem ele o Compose carrega também o
`compose.override.yaml`, que é a configuração de desenvolvimento.

O primeiro `build` no Pi demora — compila em ARM nativo. As atualizações
seguintes reaproveitam as camadas em cache.

Backup **com o servidor a correr**. Não uses `cp`: em modo WAL há escritas no
`.db-wal` que um `cp` do `.db` não apanha. O `.backup()` do `better-sqlite3` é
consistente e não bloqueia escritas:

```bash
docker compose -f compose.yaml exec server node -e "
new (require('better-sqlite3'))('data/sos.db')
  .backup('data/backup-' + new Date().toISOString().slice(0,10) + '.db')
  .then(() => console.log('ok'))"
```

O ficheiro sai em `server/data/` no host, pronto a copiar para fora do Pi. Vale
a pena pôr isto num cron semanal — o cartão SD vai falhar um dia.

---

## 13. Estado atual

Última revisão: 17 de agosto de 2026.

Uma versão anterior desta secção descrevia um servidor completo com 15 testes
ponta-a-ponta. **Esse código não existe neste repositório** — as secções 6 a 11
são especificação, não descrição do que está escrito. Se aparecer noutro sítio,
importa-se; até lá, o estado real é o que está aqui em baixo.

**Feito e verificado**

- Andaimes das três pastas: `server/` (Express 5 + TS), `dashboard/` (Vite +
  React + TS), `app/` (Expo SDK 57 + TS)
- Docker: `Dockerfile` multi-etapa, `compose.yaml` (Pi) e
  `compose.override.yaml` (dev). Build do painel dentro da imagem, hot reload
  por polling, healthcheck, backup online do SQLite
- `app.json` com nome, `package` Android e as 13 permissões da §8 declaradas
- Painel compila para `server/public/` e o Express serve-o com fallback de SPA
- `CLAUDE.md`, três skills em `skills/`, três agentes em `.claude/agents/`
- `ROADMAP.md` — inventário de funcionalidades por fazer, com prioridade
- `server/src/db.ts` — esquema, WAL, migrações (`addColumn`)
- `server/src/auth.ts` — token de dispositivo, password + JWT de cuidador,
  middlewares `requireDevice`/`requireCaregiver`
- `server/src/routes/device.ts` e `routes/caregiver.ts` — todos os 12
  endpoints do §7: emparelhamento, localizações, alertas com anti-spam
  (`server/src/alerts.ts`), heartbeat, contactos, registo/login, gestão de
  dispositivos, alertas abertos + confirmação, token FCM
- `server/src/broadcast.ts` — o ponto onde as rotas chamam `broadcast()`
- `server/src/ws.ts` — `/ws?token=<jwt>`, evento `hello`, ping de 30 s,
  difunde tudo o que passa por `broadcast()`
- `server/src/watchdog.ts` — verifica a cada minuto, `device_offline` ao fim
  de `WATCHDOG_MINUTES` (30 por omissão) sem contacto, com o anti-spam de 6h
  de `alerts.ts` a evitar repetição
- 50 testes de servidor (`node:test`), a passar no Windows e dentro do
  container Linux com o servidor de dev a correr ao lado
- Painel do cuidador (`dashboard/src/`): login/registo, visão geral (frase-
  herói + pulso + bateria + último sinal), mapa com percurso (Leaflet), lista
  de alertas abertos/histórico com confirmação, emparelhamento de
  dispositivo. Liga por WebSocket com religação automática e atualiza em
  tempo real — testado no browser a sério (não só `tsc`), incluindo layout
  estreito
- `server/src/routes/device.ts` passou a difundir também o evento `location`
  (só o último ponto do lote) — antes só os alertas chamavam `broadcast()`,
  e o pulso do painel precisa deste sinal para respirar em tempo real

**Em curso** — nada ativamente; falta só push FCM para fechar o ciclo de
alertas do servidor.

**Por fazer** — push FCM; multi-cuidador, gestão de contactos e configuração
da proteção contra fraude no painel; a app inteira para além do andaime do
Expo; tudo o resto que está no `ROADMAP.md`.

### Fases

| Fase | Conteúdo |
|---|---|
| 1 | Servidor, Pi, túnel, projeto Expo — andaimes e Docker feitos; código do servidor por fazer |
| 2 | Emparelhamento, foreground service, SOS, painel com mapa |
| 3 | Fila offline, watchdog, boot receiver, bateria, push FCM |
| 4 | Deteção de queda, geofencing, modo simplificado, lembretes de medicação |

---

## 14. Ferramentas de apoio

**Skills** (app Claude), em `skills/`:

| Skill | Dispara quando |
|---|---|
| `cuidar-backend` | Endpoints, esquema, autenticação, alertas, WebSocket |
| `cuidar-android` | Permissões, foreground service, SOS, config plugins, EAS |
| `interface-para-idosos` | Qualquer ecrã, texto ou botão que o idoso vá ver |

**Agentes** (Claude Code), em `.claude/agents/`:

| Agente | Para quê |
|---|---|
| `backend-cuidar` | Trabalho no servidor |
| `android-cuidar` | Trabalho na app |
| `revisor-cuidar` | Revisão antes de merge ou de gerar APK — não escreve código, só lê e reporta |

Vale a pena chamar o revisor antes de cada APK novo. Um APK já instalado no
telemóvel da avó é bastante mais difícil de corrigir do que um commit.