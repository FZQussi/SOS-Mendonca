---
name: cuidar-android
description: Trabalho na app Expo do idoso — permissões Android, foreground service, botão SOS e chamada direta, deteção de queda, fila offline, config plugins, EAS build e OTA, sobrevivência a fabricantes (Samsung/Xiaomi/Huawei/Oppo). Usa sempre que a tarefa toca em `app/`, `app.json`, ou fala de permissões, background, bateria, APK, keystore ou update.
---

# App do idoso (Expo)

Expo com development builds e Continuous Native Generation. Config plugins
tratam do nativo; EAS Update corrige JS sem reinstalar.

Contexto completo: `Context.md` §8 e §9.

## O princípio que domina tudo

**A app é inútil se o Android a matar.** Antes de acrescentar funcionalidades,
verifica se a fundação aguenta.

## SOS: a ordem é a funcionalidade

```
1. Vibração                    imediata, confirma que o toque registou
2. Chamada telefónica          react-native-immediate-phone-call
3. GPS + POST /alerts          em paralelo, depois
```

**Nunca metas um `await` antes da chamada.** A rede de voz funciona onde os
dados falham, e a pessoa precisa de ouvir alguém — não de saber que um servidor
recebeu um JSON. `Linking` não serve: abre o marcador, não liga.

O gatilho é uma contagem de 3 s com anel visível a preencher. Não um diálogo
"Sim/Não". Deteção de queda dá 30 s para cancelar.

## Permissões: a ordem que funciona

1. `POST_NOTIFICATIONS`
2. `ACCESS_FINE_LOCATION` → a pessoa escolhe "Enquanto usa a app"
3. **Ecrã separado com explicação**, e só depois `ACCESS_BACKGROUND_LOCATION` →
   abre as definições do sistema, onde escolhe "Permitir sempre"
4. `CALL_PHONE`
5. Isenção de otimização de bateria via `expo-intent-launcher`

Pedir tudo de uma vez faz o Android negar em silêncio, sem mostrar nada.

Todas declaradas em **`app.json`**, nunca no `AndroidManifest.xml`: com CNG a
pasta `android/` é gerada e as edições manuais desaparecem no próximo
`prebuild --clean`. Lista completa em `Context.md` §8.

## Localização

`react-native-background-geolocation` (Transistor) para o seguimento contínuo.
Gere o próprio serviço, trata de `startOnBoot` e `stopOnTerminate`.

**`expo-location` não serve para seguimento contínuo** — defeito aberto (SDK
56/57): o foreground service congela depois de qualquer atualização, incluindo
OTA. A notificação fica no ecrã, nenhuma localização chega, só um encerramento
forçado recupera. Num telemóvel no bolso de alguém que nunca vai forçar o
encerramento de nada, é falha silenciosa total. Para leituras pontuais (o GPS do
SOS) continua a servir.

## Sobreviver aos fabricantes

Samsung, Xiaomi, Huawei e Oppo matam serviços em segundo plano muito mais
agressivamente que o Android puro. Camadas, todas necessárias:

| Camada | O quê |
|---|---|
| Foreground service | `foregroundServiceType="location"` + notificação permanente |
| Isenção de bateria | Intent para as definições, no onboarding |
| Autostart | Só manual (Xiaomi/Oppo) — guia com capturas de ecrã |
| Watchdog local | `AlarmManager` de 15 em 15 min, relança o serviço |
| Boot receiver | O telemóvel vai reiniciar sozinho |
| Watchdog no servidor | 30 min sem contacto → `device_offline` |

## Fila offline

A rede vai falhar. Fila local persistente, envio em lote, **limpar só em caso de
sucesso**. Cada ponto guarda o `recorded_at` do momento em que foi capturado, não
do momento do envio.

## Builds e OTA

- **OTA só atualiza JavaScript e assets.** Bibliotecas nativas, permissões ou
  config plugins exigem APK novo instalado à mão.
- Cada OTA reinicia o processo — **confirma que o seguimento voltou depois de
  publicar**.
- Publica primeiro num canal de teste, no teu telemóvel. Uma OTA má chega a todos
  ao mesmo tempo e não há recuo remoto se a app deixar de arrancar.
- **A keystore.** Perdê-la significa que nenhuma atualização instala por cima:
  desinstalar o telemóvel da avó e perder a configuração toda. `eas credentials`
  e exporta uma cópia.
- Licença da Transistor exigida em builds de release; debug funciona sem ela. Para
  uso familiar, um debug build com o bundle JS embutido é saída legítima — APK
  maior e mais lento, mas funcional e legal.

## A app é visível, por decisão

Ícone no launcher, notificação permanente do serviço, ecrã "O que é partilhado",
histórico do que foi enviado consultável pelo próprio idoso. Cuidado consentido,
não vigilância — e o RGPD aplica-se mesmo entre familiares.

Qualquer ecrã que o idoso veja: usa a skill `interface-para-idosos`.
