# Roadmap — SOS Mendonça

Lista de funcionalidades, organizada por onde vivem (app, painel, servidor) e
por prioridade. `Context.md` continua a ser a referência de arquitetura e
decisões; este documento é a lista de trabalho que se risca à medida que se
avança.

Não é uma promessa de todas as linhas — é o inventário para escolher a partir
dele. `[ ]` por fazer, `[~]` em curso, `[x]` feito.

---

## 0. Proteção contra fraude — a decisão antes das funcionalidades

Pessoas idosas a viver sozinhas são o alvo preferido de burlas por telefone e
SMS: o "neto preso", o "técnico do banco", o "suporte da Microsoft" a pedir
acesso remoto. Faz todo o sentido a app ajudar aqui. Mas há uma linha a não
cruzar, e o `Context.md` §11 já a tinha marcado antes deste roadmap existir:
**leitura de SMS está fora de âmbito, por decisão** — é a permissão mais
sensível do Android, o RGPD aplica-se mesmo entre familiares, e transformaria
"app de cuidado" em "app de vigilância".

A resposta que a §11 já apontava, e que este roadmap segue:

> **Deteção no telemóvel, alerta no painel. Nunca o conteúdo.**

Concretamente:

| | O que NÃO se faz | O que se faz em vez disso |
|---|---|---|
| SMS | Ler ou copiar o texto das mensagens para o servidor | Um classificador local corre no telemóvel; só sobe `POST /alerts` com `type: possible_scam`, sem o corpo da mensagem |
| Chamadas | Espelhar o histórico completo de chamadas | Comparar o número com listas de reputação (locais + `numeroverificado.pt`/equivalente); alertar só quando bate |
| Apps instaladas | Enviar o inventário completo de apps do telemóvel | Verificar contra uma lista curta de apps de acesso remoto conhecidas (AnyDesk, TeamViewer, QuickSupport…); alertar só na instalação ou abertura de uma dessas |

Isto dá ao cuidador o sinal que importa — "pode estar a acontecer uma burla
agora" — sem o servidor (e, por extensão, qualquer fuga de dados) ficar com
uma cópia de com quem a pessoa fala ou o que lê. Mantém-se dentro do "cuidado
consentido, não vigilância" do princípio 5.

Se a decisão for mesmo espelhar conteúdo completo, é uma escolha válida — mas
muda o enquadramento legal do projeto (deixa de bastar consentimento familiar
informal) e o público-alvo de "uso familiar" para algo mais perto de um
produto de controlo parental. Vale a pena essa conversa antes de a implementar,
não depois.

---

## 1. App do idoso

### 1.1 Núcleo de segurança (base do projeto, Fase 2)

- [ ] Botão SOS: contagem de 3 s, vibração → chamada → GPS + `POST /alerts`
- [ ] Chamada direta ao contacto primário (`react-native-immediate-phone-call`)
- [ ] Deteção de queda (acelerómetro), 30 s para cancelar
- [ ] Localização contínua em segundo plano (`react-native-background-geolocation`)
- [ ] Fila offline persistente, envio em lote, limpar só em caso de sucesso
- [ ] Ecrã de contactos de emergência (ver, não editar — isso é do painel)
- [ ] Ecrã "O que é partilhado" (§11 — a app é visível, não escondida)
- [ ] Onboarding: emparelhamento por código, pedido de permissões na ordem certa

### 1.2 Sobrevivência em segundo plano (Fase 3)

- [ ] Foreground service com notificação permanente
- [ ] Isenção de otimização de bateria (intent, no onboarding)
- [ ] Guia de autostart para Xiaomi/Oppo (manual, com capturas de ecrã)
- [ ] Watchdog local (`AlarmManager`, 15 em 15 min) que relança o serviço
- [ ] Boot receiver
- [ ] Heartbeat periódico com nível de bateria

### 1.3 Proteção contra fraude e engenharia social

Ver §0 para o porquê da abordagem local-primeiro.

- [ ] Classificador local de SMS: padrões de urgência + pedido de dinheiro/PIN/
      código (regras, não IA — mais previsível, corre offline, sem custo)
- [ ] Alerta `possible_scam` quando o classificador dispara (sem o texto)
- [ ] Deteção de chamadas de números com má reputação (lista local + API de
      terceiros tipo "Quem Ligou", com *opt-out* se a família não quiser)
- [ ] Alerta `remote_access_app_detected` na instalação/abertura de apps da
      lista de risco (AnyDesk, TeamViewer, QuickSupport, RustDesk…)
- [ ] Lista de apps de risco gerílevel no painel pelo cuidador (não fixa no
      código — surgem apps novas)
- [ ] "Pausa de confirmação": se o classificador disparar durante uma chamada
      em curso, oferece um botão único — "Ligar a [contacto de confiança]
      agora" — sem fechar a chamada corrente à força
- [ ] Palavra-código familiar: frase combinada em privado que um "familiar" ao
      telefone tem de saber dizer antes de um pedido de dinheiro ser levado a
      sério — ajuda contra vozes clonadas por IA ("golpe do neto" moderno)
- [ ] Ecrã educativo pós-alerta: "Isto pode ser uma burla. Não dê códigos por
      telefone." — linguagem simples, sem assustar (§10)
- [ ] Bloqueio opcional de chamadas de números internacionais desconhecidos,
      configurável pelo cuidador, nunca automático sem consentimento do idoso

### 1.4 Modo simplificado e acessibilidade (Fase 4)

- [ ] Modo com menos apps visíveis no ecrã principal — reduz também a
      superfície de ataque para instalar algo indesejado
- [ ] Contraste, tamanhos e linguagem — já cobertos pela skill
      `interface-para-idosos`, aplicar em todo o ecrã novo

### 1.5 Bem-estar (Fase 4)

- [ ] Lembretes de medicação, com confirmação simples de "tomei"
- [ ] Check-in diário opcional: um toque de "estou bem" que reinicia o
      watchdog sem esperar por um sinal de localização
- [ ] Alerta de calor/frio extremo na zona do dispositivo (idade + isolamento
      é o perfil de risco clássico em vagas de calor)

---

## 2. Painel do cuidador

### 2.1 Visão geral (Fase 2)

- [x] O pulso — respira a cada sinal, apaga no silêncio
- [x] Frase-herói: "A Maria está bem." antes de qualquer gráfico
- [x] Mapa com última posição e histórico (Leaflet + OSM)

### 2.2 Alertas (Fase 2–3)

- [x] Lista de alertas abertos, com confirmação (quem + quando)
- [x] Histórico completo (falta filtrar por tipo e data — só reverse
      chronológico por agora)
- [x] Tipos de alerta atuais: `sos`, `fall`, `low_battery`, `device_offline`,
      `geofence`
- [ ] Tipos novos para a §1.3: `possible_scam`, `remote_access_app_detected`,
      `suspicious_call` — exige rever o `CHECK` da coluna `type` em `alerts`
      (ver `server/src/db.ts`)
- [ ] Push FCM ao cuidador quando um alerta abre (o `TODO` já existe em
      `Context.md` §13)

### 2.3 Dispositivos e contactos (Fase 2)

- [x] Emparelhar novo dispositivo (gera código de 6 dígitos) — o mínimo para
      a visão geral ser utilizável; edição de contactos e versão da app
      ficam por fazer
- [ ] Editar contactos de emergência e prioridade
- [ ] Ver estado da bateria e versão da app por dispositivo

### 2.4 Configuração da proteção contra fraude (nova)

- [ ] Gerir a lista de apps de risco conhecidas (§1.3)
- [ ] Ativar/desativar cada camada de deteção por dispositivo — nem toda a
      família vai querer a mesma intensidade
- [ ] Ver estatística de alertas de fraude sem nunca ver conteúdo — "3
      chamadas suspeitas este mês", não "chamada de X às 15h32 durou 4 min"

### 2.5 Conta e multi-cuidador (Fase 3)

- [ ] Mais do que um cuidador por dispositivo (hoje o registo fecha ao
      primeiro utilizador — decidir se um convite substitui isso)
- [ ] Recuperação de password (hoje não existe — só faz sentido com envio de
      email, que o Pi não tem configurado)

### 2.6 Segurança do próprio painel (o servidor está exposto à internet)

- [ ] Rate limit no `/api/v1/auth/login` — o túnel Cloudflare expõe o painel
      publicamente; sem isto é *brute-force* aberto
- [ ] Log de auditoria: quem confirmou que alerta, quando, a partir de que IP
- [ ] Sessão JWT revogável (hoje um token de 30 dias não tem forma de ser
      invalidado antes de expirar — nem com logout)
- [ ] Alerta ao cuidador se o dispositivo tentar re-emparelhar (pode ser sinal
      de alguém a tentar assumir o telemóvel)

---

## 3. Servidor (o que suporta o resto)

- [x] `db.ts`
- [x] `auth.ts`
- [x] Rotas de dispositivo: `pair`, `locations`, `alerts`, `heartbeat`,
      `contacts` (só `PUT` — ver a falta do `GET` abaixo)
- [x] Rotas de cuidador: `auth/register`, `auth/login`, `devices`, `alerts`,
      `me/fcm-token`
- [x] WebSocket (`/ws`) com ping de 30 s e eventos `hello`/`location`/`alert`
- [x] Watchdog de 30 min → `device_offline`
- [x] Anti-spam em alertas automáticos (bateria 1h, offline 6h — nunca no SOS)
- [ ] `GET /api/v1/device/contacts` — falta. O dispositivo só consegue
      enviar contactos (`PUT`), nunca lê de volta; se o cuidador os editar no
      painel, a app não tem como saber. Por agora a app guarda a sua própria
      cópia local e é a origem da verdade dos seus contactos
- [ ] Push FCM
- [ ] Endpoint para a lista de apps de risco (§2.4), consumido pela app

---

## 4. Ordem sugerida

Isto não é rígido — é a ordem que faz cada peça já ser útil sozinha antes de
avançar para a seguinte.

1. Rotas de dispositivo e cuidador (§3) — sem isto nada mais liga a nada
2. WebSocket + watchdog — fecha o ciclo "silêncio é um alerta" (princípio 1)
3. App: núcleo de segurança (§1.1) + painel: visão geral e alertas (§2.1–2.2)
4. Sobrevivência em segundo plano (§1.2) — sem isto o resto morre em 2 dias
   num Xiaomi
5. Proteção contra fraude, começando pela deteção de apps de risco (§1.3) — é
   a mais simples das três (uma lista, sem processamento de linguagem) e já
   dá valor real
6. Classificador de SMS e de chamadas (§1.3) — mais trabalho, testar bem os
   falsos positivos antes de ativar por omissão
7. Resto: multi-cuidador, bem-estar, modo simplificado

---

## 5. Fora de âmbito, por decisão

- **Ler o conteúdo de SMS ou chamadas.** Ver §0.
- **Rastreio contínuo por Wi-Fi/Bluetooth de terceiros na casa.** Não é o
  problema que este projeto resolve.
- **IA generativa a decidir se algo é burla.** Regras locais são mais
  previsíveis, mais baratas, e não dependem de rede — o classificador de SMS
  tem de correr offline, no bolso de alguém sem 4G estável.
