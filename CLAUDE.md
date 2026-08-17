# SOS Mendonça

**Lê o `Context.md` primeiro.** É o documento de referência: arquitetura, stack,
esquema da base de dados, API, armadilhas conhecidas, estado atual. Este ficheiro
só tem as regras que não se descobrem a ler código.

Trabalha e comenta em português de Portugal. Nomes de código em inglês.

## Regras que não se negoceiam

Vêm dos seis princípios (`Context.md` §5). Se uma delas te parecer estorvo,
estás a resolver o problema errado.

1. **No SOS, a chamada telefónica vem antes de tudo.** Nunca metas um `await`
   (localização, rede, storage) antes de `immediatePhoneCall`. Vibrar, ligar,
   *depois* GPS e `POST`.
2. **Nunca retires o watchdog do servidor.** 30 min sem contacto → alerta
   `device_offline`. Um telemóvel silencioso é exatamente o que queremos detetar.
3. **Ordena localizações por `recorded_at DESC`**, nunca por `received_at` — a
   fila offline reenvia em lote e o percurso sai trocado.
4. **Dois mundos de autenticação.** Dispositivo = token opaco (`requireDevice`,
   `/api/v1/device/*`). Cuidador = JWT (`requireCaregiver`). O telemóvel do idoso
   **nunca** tem ecrã de login.
5. **Compatibilidade só para a frente.** A app antiga fica semanas no telemóvel.
   Acrescenta campos; nunca mudes o significado de um existente. Quebra mesmo?
   `/api/v2`, mantendo o `v1`.
6. **Permissões só em `app.json`.** Com CNG, `android/` é gerado — editar o
   `AndroidManifest.xml` à mão desaparece no próximo `prebuild --clean`.
7. **Alertas automáticos levam anti-spam** (bateria 1 h, offline 6 h). O SOS
   nunca é suprimido.
8. **Nada de `expo-location` para seguimento contínuo** — ver `Context.md` §9.
   Usa `react-native-background-geolocation`. Para leituras pontuais serve.
9. **`READ_SMS` está fora do âmbito**, por decisão. Não o proponhas.

## Ao acabar uma alteração

- Servidor/dashboard: `npx tsc --noEmit`
- Endpoint novo: um `curl` que cubra o caminho de falha, não só o caso feliz
- Zod antes de tocar na BD; `db.prepare` com `?`, nunca interpolação em SQL
- Alerta novo: `broadcast()` a seguir ao `INSERT`
- Antes de gerar APK: chama o agente `revisor-cuidar`

## Estilo

Este projeto é para uma família, não para escalar. Sem abstrações
especulativas, sem camadas "para depois". A biblioteca já instalada antes da
nova; uma linha antes de cinquenta.
