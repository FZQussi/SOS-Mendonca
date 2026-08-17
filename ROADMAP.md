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

Escrito, mas **nada disto foi ainda corrido num telemóvel a sério** — não há
development build. `[x]` aqui significa "código feito e a compilar", não
"verificado no terreno".

- [x] Botão SOS: contagem de 3 s, vibração → chamada → GPS + `POST /alerts`
- [x] Chamada direta ao contacto primário (`react-native-immediate-phone-call`)
- [~] Deteção de queda (acelerómetro), 30 s para cancelar — queda livre
      seguida de impacto, com testes; ecrã "Caiu?" com "Estou bem" a fechar.
      **Só corre com a app em primeiro plano** (`expo-sensors` não entrega
      leituras fiáveis com o ecrã apagado); em segundo plano exige um listener
      nativo dentro do foreground service. Limiares por afinar num telemóvel
- [x] Localização contínua em segundo plano (`react-native-background-geolocation`)
- [x] Fila offline persistente, envio em lote, limpar só em caso de sucesso
- [x] Ecrã de contactos de emergência (ver, não editar — isso é do painel)
- [x] Ecrã "O que é partilhado" (§11 — a app é visível, não escondida)
- [x] Onboarding: emparelhamento por código, pedido de permissões na ordem certa

### 1.2 Sobrevivência em segundo plano (Fase 3)

- [x] Foreground service com notificação permanente — o do SDK da Transistor,
      configurado no `ready()`; não há serviço próprio a manter
- [x] Isenção de otimização de bateria (intent, no onboarding)
- [ ] Guia de autostart para Xiaomi/Oppo (manual, com capturas de ecrã)
- [ ] Watchdog local (`AlarmManager`, 15 em 15 min) que relança o serviço
- [x] Boot receiver — `startOnBoot: true` + `stopOnTerminate: false` do SDK

#### Sobreviver a fechar a app

O idoso vai deslizar a app para fora dos recentes, mais cedo ou mais tarde,
sem perceber que a desligou. A partir daí o sistema tem de continuar a
funcionar sozinho — se depender de alguém se lembrar de a reabrir, não serve.

- [ ] **Confirmar que o serviço sobrevive ao *swipe away***. O
      `stopOnTerminate: false` está configurado (`app/src/lib/location.ts`),
      mas nunca foi visto a funcionar num telemóvel. É o teste que decide se
      o resto desta lista é preciso: fechar a app, esperar uma hora, ver se
      continuam a chegar localizações
- [ ] Emparelhamento persiste a fechar/matar a app — o token está em
      AsyncStorage, portanto deve sobreviver; falta confirmar que a app volta
      ao ecrã inicial e não ao ecrã de emparelhamento
- [ ] Relançar o processo depois de o Android o matar (é o watchdog
      `AlarmManager` acima; sem ele, um Xiaomi corta e ninguém dá por isso)
- [ ] Notificação permanente que reabre a app com um toque — hoje só informa
- [ ] Heartbeat e fila offline a correr **fora do ciclo de vida do React**.
      Hoje o `startTracking()` e o `syncContacts()` arrancam no `App.tsx`: com
      a app fechada, o serviço da Transistor continua, mas o JavaScript que
      esvazia as filas e envia o heartbeat pode não estar vivo. Decidir entre
      o `headlessTask` da Transistor e mover o envio para o próprio SDK
- [ ] Deteção de queda em segundo plano — listener nativo dentro do foreground
      service. Hoje só corre com a app à frente (`Context.md` §9)
- [ ] Ecrã "está tudo a funcionar?" no telemóvel: última vez que enviou,
      serviço vivo, permissões em falta. Para alguém da família confirmar num
      instante, sem abrir o painel
- [x] Heartbeat periódico com nível de bateria — `heartbeatInterval` de 15 min;
      é também o relógio que esvazia a fila offline e dispara `low_battery`

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

- [ ] Lembretes de medicação, com confirmação simples de "tomei" — o horário
      e a lista de medicamentos são geridos no painel (§2.8), o telemóvel só
      mostra e regista
- [ ] Alerta ao cuidador quando um medicamento fica por confirmar ao fim de
      X minutos — com anti-spam, senão vira ruído diário
- [ ] Check-in diário opcional: um toque de "estou bem" que reinicia o
      watchdog sem esperar por um sinal de localização
- [ ] Alerta de calor/frio extremo na zona do dispositivo (idade + isolamento
      é o perfil de risco clássico em vagas de calor)

### 1.6 Percurso quando não há rede

Sem rede não há alerta a chegar a lado nenhum — mas o telemóvel continua a
saber onde esteve. Guardar esse percurso e entregá-lo inteiro quando a rede
voltar é o que permite responder, depois, à única pergunta que interessa:
*aconteceu alguma coisa enquanto estivemos às escuras?*

- [x] Fila offline persistente para localizações (`offlineQueue.ts`)
- [ ] **Gravar com a mesma cadência sem rede.** Hoje o envio é que está
      resolvido; falta confirmar que o `distanceFilter: 30` do SDK não deixa
      buracos no percurso quando ninguém está a receber. Se deixar, baixá-lo
      ou activar a persistência interna da Transistor
- [ ] Guardar também os pontos que o SDK já persiste sozinho (`getLocations()`)
      e não só os que passaram pelo nosso `onLocation` — se o JavaScript
      estiver morto, é o único sítio onde o percurso existe
- [ ] Marcar cada ponto com o facto de ter sido gravado sem rede, para o
      painel poder desenhar o troço às escuras de outra maneira
- [ ] Teto da fila: quantos pontos se guardam antes de começar a deitar fora
      os mais antigos. Um fim de semana sem rede não pode encher o telemóvel
      (nem rebentar o `POST` do lado do servidor, que aceita 500 de cada vez)

### 1.7 Sem movimento, e o que fazer a seguir

O caso que isto resolve: a pessoa caiu, não chegou ao telemóvel, e ninguém
sabe. O silêncio já é um alerta (princípio 1), mas "sem sinal" e "o telemóvel
está parado há 14 horas em cima da mesa" são coisas diferentes, e a segunda é
mais assustadora.

- [ ] Deteção de ausência de movimento: o SDK da Transistor já classifica
      atividade (`still`, `walking`, `in_vehicle`) — usar isso em vez de
      inventar heurísticas com o acelerómetro
- [ ] Alerta `no_movement` ao fim de N horas paradas, com N configurável no
      painel por dispositivo. De noite não vale o mesmo que às 3 da tarde:
      janela horária, senão dispara todas as madrugadas
- [ ] Confirmação suave antes de alertar: o telemóvel toca, mostra "Está
      tudo bem?" em ecrã cheio e espera. Só alerta se ninguém responder —
      a mesma lógica dos 30 s da deteção de queda

#### Verificação por voz (o que substitui "ligar o microfone")

Quando `no_movement` ou uma queda não confirmada dispara, o cuidador precisa
de saber se a pessoa está a pedir ajuda ou a dormir a sesta. A forma de o
fazer **não é abrir o microfone à distância** — é o telemóvel atender uma
chamada de voz sozinho, em alta voz, depois de avisar em voz alta que o vai
fazer. O áudio nunca passa pelo servidor: vai pela rede de voz, que é a que
funciona onde os dados falham (princípio 2) e a que não deixa gravações no
Pi para alguém perder depois.

- [ ] Atendimento automático em alta voz, **só** de números da lista de
      contactos de emergência (§2.3), nunca de um número qualquer
- [ ] Aviso audível e em ecrã cheio antes de abrir o som: "A sua família vai
      poder ouvi-lo. Diga se precisa de ajuda." — com vibração, porque um dos
      canais pode estar indisponível (§10)
- [ ] Um botão grande para recusar, que funciona sempre. Se a pessoa recusar,
      fica registado e o cuidador vê que recusou — não é uma falha de sistema
- [ ] Cada atendimento automático fica no ecrã "O que é partilhado", com hora
      e quem ligou. Sem registo visível não é cuidado consentido, é escuta
- [ ] Ligar/desligar a funcionalidade por dispositivo no painel, e com o
      consentimento do próprio a ficar escrito algures que não seja só a
      memória de quem configurou

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
- [ ] Tipos novos para a §1.3 e §1.7: `possible_scam`,
      `remote_access_app_detected`, `suspicious_call`, `no_movement`,
      `new_app_installed`, `medication_missed` — exige rever o `CHECK` da
      coluna `type` em `alerts` (ver `server/src/db.ts`) e acrescentar a
      etiqueta em português nos dois clientes (`ALERT_LABEL` no painel,
      `pushBody` no `push.ts`)
- [~] Push FCM ao cuidador quando um alerta abre — servidor feito
      (`server/src/push.ts`, ligado ao `createAlert`). Falta pôr a credencial
      do Firebase (§12 do `Context.md`) e o painel pedir permissão e registar
      o token no `PUT /me/fcm-token`, que já existe e ninguém chama

### 2.3 Dispositivos e contactos (Fase 2)

- [x] Emparelhar novo dispositivo (gera código de 6 dígitos) — o mínimo para
      a visão geral ser utilizável; edição de contactos e versão da app
      ficam por fazer
- [x] Editar contactos de emergência e prioridade — cartão "Quem ligar" no
      painel; a prioridade é a ordem das linhas, não um campo à parte
- [x] Ver estado da bateria e versão da app por dispositivo — na linha por
      baixo da frase-herói. A versão vem do `X-SOS-App-Version` que a app
      manda em todos os pedidos; só se grava quando muda

### 2.4 Configuração da proteção contra fraude (nova)

- [ ] Gerir a lista de apps de risco conhecidas (§1.3)
- [ ] Ativar/desativar cada camada de deteção por dispositivo — nem toda a
      família vai querer a mesma intensidade
- [ ] Ver estatística de alertas de fraude sem nunca ver conteúdo — "3
      chamadas suspeitas este mês", não "chamada de X às 15h32 durou 4 min"

#### Apps e números, geridos a partir do painel

Tudo o que a app do idoso tem de decidir sozinha (que app é de risco, que
número é de confiança) tem de ser configurável de fora — senão cada mudança
obriga a um APK novo instalado à mão no telemóvel de quem menos pode com isso.

- [ ] **Espelho das apps instaladas**: o telemóvel envia a lista, o painel
      mostra-a, o cuidador marca cada uma como aceite ou de risco. Precisa de
      `QUERY_ALL_PACKAGES` — fora da Play Store é permissão disponível, e
      este projeto instala-se à mão de qualquer forma (§11 exige que apareça
      no "O que é partilhado")
- [ ] Alerta quando aparece uma app nova que ninguém aprovou — é o sinal de
      "alguém instalou-lhe qualquer coisa ao telefone"
- [ ] **Desinstalar à distância** a partir do painel. Atenção: um Android só
      deixa uma app desinstalar outra se for *device owner*, e isso exige
      provisionar o telemóvel de raiz (reposição de fábrica). Decidir se vale
      a pena antes de prometer o botão; a alternativa honesta é o painel
      dizer "desinstale isto" e guiar a família passo a passo
- [ ] **Lista de números**: contactos de confiança (atendimento automático da
      §1.7, nunca alertar sobre eles) e números bloqueados, geridos no painel
      e sincronizados para o telemóvel como os contactos de emergência
- [ ] Endpoint de sincronização para tudo isto, no ritmo do heartbeat — a
      mesma solução dos contactos, não uma nova

### 2.8 Medicação e rotinas

O telemóvel do idoso mostra e confirma; quem define o quê e a que horas é a
família, no painel. O contrário obrigaria a pessoa a configurar um horário
num ecrã pequeno, que é exatamente o que este projeto não faz.

- [ ] Gerir medicamentos por dispositivo: nome, dose, horas do dia, dias da
      semana
- [ ] Ver o histórico de confirmações — "tomou", "não confirmou", a que horas
- [ ] Alerta configurável quando fica por confirmar (§1.5), com janela
      anti-spam própria
- [ ] Tabelas novas no servidor (`medications`, `medication_log`) e endpoints
      dos dois lados: o cuidador escreve, o dispositivo lê e confirma

### 2.5 Conta e multi-cuidador (Fase 3)

- [ ] Mais do que um cuidador por dispositivo (hoje o registo fecha ao
      primeiro utilizador — decidir se um convite substitui isso)
- [ ] Recuperação de password (hoje não existe — só faz sentido com envio de
      email, que o Pi não tem configurado)

### 2.6 Segurança do próprio painel (o servidor está exposto à internet)

- [x] Rate limit no `/api/v1/auth/login` — e também no `/device/pair`, que
      tinha o mesmo buraco com um segredo de só 6 dígitos. Conta-se apenas o
      que falha (10 por conta, 20 no emparelhamento, janela de 15 min), por
      isso ninguém legítimo é travado. Ver o comentário em `auth.ts` para o
      porquê de a chave não ser o IP
- [ ] Log de auditoria: quem confirmou que alerta, quando, a partir de que IP
- [x] Sessão JWT revogável — coluna `token_version` nos cuidadores, dentro do
      JWT. "Sair em todo o lado" no painel sobe-a e todos os tokens já
      assinados deixam de valer, HTTP e WebSocket incluídos. O "Sair" normal
      continua a fechar só a janela onde se carregou
- [ ] Alerta ao cuidador se o dispositivo tentar re-emparelhar (pode ser sinal
      de alguém a tentar assumir o telemóvel)

---

### 2.7 Reconstruir o que aconteceu às escuras

O contraponto da §1.6: o telemóvel guardou o percurso, e agora alguém tem de
o conseguir ler. Quando um lote offline chega, o mapa passa a ter pontos de
uma hora que já passou — e é aí que se vê se houve uma queda no caminho, uma
paragem onde não devia, ou um telemóvel parado sozinho num sítio qualquer.

- [x] Mapa com o percurso das últimas 24 h (Leaflet + OSM)
- [ ] **Marcar o período sem rede** no mapa e numa linha do tempo: "esteve sem
      sinal das 14h10 às 15h02 — este foi o percurso nesse tempo". Hoje os
      pontos aparecem todos iguais e o buraco é invisível
- [ ] Distinguir no mapa o troço recebido em tempo real do que chegou em lote
      (traço cheio vs. tracejado, por exemplo)
- [ ] Sinais de que algo se passou no percurso, sem inventar diagnósticos:
      - paragem longa fora dos sítios habituais
      - último ponto isolado, longe de tudo, seguido de silêncio
      - salto impossível entre dois pontos (erro de GPS, não uma corrida)
- [ ] Escolher a janela de tempo do mapa (hoje são sempre 24 h, fixas no
      `App.tsx`) e conseguir voltar ao dia anterior
- [ ] Ver o percurso de um alerta: abrir um `sos` ou `fall` do histórico e o
      mapa saltar para o que estava a acontecer àquela hora

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
- [x] `GET /api/v1/device/contacts` e `PUT /api/v1/devices/:id/contacts` — o
      sentido inverteu-se: a origem da verdade passou a ser o servidor. O
      `PUT /device/contacts` fica só para o onboarding (a app escreve o
      primeiro contacto antes de o cuidador abrir o painel); daí em diante a
      app lê, a cada heartbeat, e guarda uma cópia local para o SOS poder
      ligar sem rede
- [~] Push FCM — ver §2.2
- [ ] Endpoint para a lista de apps de risco (§2.4), consumido pela app
- [ ] `GET /devices/:id/locations` devolver também o `received_at` — a coluna
      já existe e é a única forma de o painel saber que pontos chegaram em
      lote depois de uma passagem offline (§2.7). É um campo novo, portanto
      não parte a app antiga
- [ ] Endpoint (ou campo) que diga os períodos em que o dispositivo esteve sem
      contactar — dá para calcular a partir dos `received_at`, mas fazê-lo no
      servidor evita repetir a conta no painel
- [ ] Aceitar lotes maiores do que 500 pontos, ou dizer à app para partir em
      vários pedidos. Um fim de semana inteiro sem rede passa desse limite

---

## 4. Ordem sugerida

Isto não é rígido — é a ordem que faz cada peça já ser útil sozinha antes de
avançar para a seguinte.

1. Rotas de dispositivo e cuidador (§3) — sem isto nada mais liga a nada
2. WebSocket + watchdog — fecha o ciclo "silêncio é um alerta" (princípio 1)
3. App: núcleo de segurança (§1.1) + painel: visão geral e alertas (§2.1–2.2)
4. Sobrevivência em segundo plano (§1.2) — sem isto o resto morre em 2 dias
   num Xiaomi. **Começa pelo teste do *swipe away***: fechar a app e ver se
   as localizações continuam a chegar. Essa hora de trabalho decide quanto do
   resto de §1.2 é mesmo preciso, e não se ganha nada por adivinhar antes
5. Percurso offline ponta a ponta (§1.6 + §3 + §2.7) — gravar sem rede,
   entregar em lote, e o painel saber desenhar o buraco. Só faz sentido
   depois do ponto 4: de nada serve gravar bem um percurso se o serviço
   morreu a meio dele
6. Proteção contra fraude, começando pela deteção de apps de risco (§1.3) — é
   a mais simples das três (uma lista, sem processamento de linguagem) e já
   dá valor real
7. Classificador de SMS e de chamadas (§1.3) — mais trabalho, testar bem os
   falsos positivos antes de ativar por omissão
8. Resto: multi-cuidador, bem-estar, modo simplificado

---

## 5. Fora de âmbito, por decisão

- **Ler o conteúdo de SMS ou chamadas.** Ver §0.
- **Abrir o microfone à distância, sem a pessoa saber.** A necessidade é real
  — saber se alguém caiu e está a pedir ajuda — e está resolvida na §1.7 pela
  chamada de voz com aviso audível: a família ouve na mesma, o áudio nunca
  passa nem fica no servidor, e a pessoa pode recusar. A versão escondida é
  que fica de fora: em Portugal gravar alguém sem consentimento é crime
  (art.º 199.º do Código Penal), o RGPD aplica-se entre familiares (§11), e
  uma app que escuta em segredo deixa de ser um sistema de cuidado no dia em
  que a pessoa descobre — que é o dia em que ela a desinstala.
- **Câmara, em qualquer forma.** Além do problema legal ser o mesmo, não
  funciona: um telemóvel que a pessoa não conseguiu alcançar está no bolso,
  virado para baixo ou debaixo dela. O microfone ainda ouve um pedido de
  ajuda; a câmara filma o forro de um casaco. Não vale o custo de a pedir.
- **Rastreio contínuo por Wi-Fi/Bluetooth de terceiros na casa.** Não é o
  problema que este projeto resolve.
- **IA generativa a decidir se algo é burla.** Regras locais são mais
  previsíveis, mais baratas, e não dependem de rede — o classificador de SMS
  tem de correr offline, no bolso de alguém sem 4G estável.
