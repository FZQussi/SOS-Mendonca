---
name: cuidar-backend
description: Trabalho no servidor do SOS Mendonça — endpoints da API, esquema SQLite, autenticação de dispositivo e de cuidador, alertas, WebSocket, watchdog, push FCM. Usa sempre que a tarefa toca em `server/`, ou fala de rotas, tabelas, tokens, emparelhamento, broadcast ou anti-spam.
---

# Servidor do SOS Mendonça

Node + TypeScript + Express + `better-sqlite3` + `ws` + `zod`. Corre num
Raspberry Pi, um só processo via PM2, servindo também o dashboard compilado de
`server/public/`.

Detalhe completo do esquema e dos endpoints: `Context.md` §6 e §7. Não o repitas
aqui — lê lá.

## Autenticação: dois mundos que não se misturam

| | Dispositivo (idoso) | Cuidador (painel) |
|---|---|---|
| Credencial | Token opaco, 64 hex | JWT, 30 dias |
| Obtém-se | Código de emparelhamento de 6 dígitos | Email + password (bcrypt) |
| Na BD | Só o hash SHA-256 | Nada, é assinado |
| Middleware | `requireDevice` | `requireCaregiver` |
| Rotas | `/api/v1/device/*` | `/api/v1/*` |

Confundir isto é o erro mais fácil de cometer neste código. O telemóvel do idoso
nunca faz login.

## Ao adicionar um endpoint

1. Schema Zod primeiro. `req.body` nunca chega cru à base de dados.
2. `db.prepare` com placeholders `?`. Interpolação em SQL, nunca.
3. Escritas múltiplas em `db.transaction(() => {...})()` — repara nos parênteses
   finais, o `better-sqlite3` devolve uma função.
4. Alerta novo → `broadcast()` imediatamente depois do `INSERT`.
5. Alerta automático → janela anti-spam (bateria 1 h, offline 6 h). O `sos` nunca
   é suprimido.
6. Resposta em JSON com o mesmo formato dos endpoints vizinhos.
7. `npx tsc --noEmit` e um `curl` que exercite o caminho de falha (token
   inválido, corpo malformado), não só o caso feliz.

## Alterar o esquema

`db.ts` usa `CREATE TABLE IF NOT EXISTS`. Colunas novas em tabelas existentes
**não aparecem** só por editares o ficheiro — precisas da migração explícita:

```ts
const cols = db.prepare(`PRAGMA table_info(devices)`).all() as { name: string }[];
if (!cols.some(c => c.name === 'nova_coluna')) {
  db.exec(`ALTER TABLE devices ADD COLUMN nova_coluna TEXT`);
}
```

## Tempo: duas colunas, e a diferença importa

`recorded_at` = hora no telemóvel, é a que interessa ao cuidador.
`received_at` = hora de chegada ao servidor. Divergem quando a fila offline
reenvia um lote. **Consultas ordenam por `recorded_at DESC`.**

## Watchdog

Sem contacto de um dispositivo há 30 min → alerta `device_offline`. É a última
camada de defesa contra os fabricantes que matam serviços em segundo plano
(`Context.md` §8). Nunca a desligues para "reduzir falsos positivos".

## Compatibilidade

A app antiga fica no telemóvel semanas — não controlas quando a pessoa atualiza.
Aceita sempre pedidos de versões antigas: acrescenta campos, nunca lhes mudes o
significado. Quebra inevitável → `/api/v2`, mantendo o `v1` vivo. O cabeçalho
`X-SOS-App-Version` diz-te que versão cada telemóvel corre.

## WebSocket

`/ws?token=<jwt>`. Eventos `hello`, `location`, `alert`. Ping de 30 em 30 s para
atravessar o Cloudflare Tunnel — sem isso o túnel fecha a conexão por inatividade.
