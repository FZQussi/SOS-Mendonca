---
name: interface-para-idosos
description: Desenho de qualquer ecrã, texto, botão ou mensagem que uma pessoa idosa vá ver na app do SOS Mendonça — tamanhos de toque, tipografia, contraste, linguagem, confirmações, ecrã de SOS. Usa também para o painel do cuidador (paleta e tom). Dispara em qualquer trabalho de UI, cópia de texto ou mensagem de erro visível.
---

# Interface

## Para o idoso

Desenhar para alguém de 80 anos não é desenhar igual com letras maiores.

| | Mínimo |
|---|---|
| Área de toque | 60 dp; o SOS 100 dp ou mais |
| Texto base | 22 sp |
| Botões principais | 26 sp+ |
| Nunca abaixo de | 18 sp |
| Contraste | 7:1 (WCAG AAA), não 4.5:1 |
| Resposta ao toque | < 100 ms |

- **Uma ação por ecrã.** Dois botões de igual peso fazem a pessoa hesitar.
- **Ícones nunca sozinhos** — sempre ícone + palavra.
- **Sem gestos.** Nada de deslizar, arrastar, toque longo ou duplo.
- **Sem temporizadores.** O que aparece fica até a pessoa decidir.
- Nada de cinzento sobre branco.
- Se o retorno tardar mais de 100 ms, a pessoa toca três vezes — e três SOS não
  são três emergências.

**SOS:** contagem de 3 s com anel visível a preencher, não um diálogo "Sim/Não"
em letras pequenas.

**Confirmação por três canais:** visual, vibração e som. Um deles pode estar
indisponível — o telemóvel em silêncio, no bolso, ou a pessoa não vê o ecrã.

### Linguagem

Trata por **"você"**. Nunca infantilizes.

Sem termos técnicos, sem metáforas de computador, sem humor. A mensagem diz o
que aconteceu e o que vai acontecer a seguir:

| Não | Sim |
|---|---|
| "Erro de autenticação" | "Não consegui ligar-me. Vou tentar outra vez." |
| "Sincronização pendente" | "Vou enviar quando houver rede." |
| "GPS indisponível" | "Ainda não sei onde está. Continuo a procurar." |
| "Permissão negada" | "Preciso de autorização para o ajudar. Vou mostrar-lhe como." |

## Painel do cuidador

Paleta do azulejo português — azul de tinta sobre parede caiada. A ideia é uma
casa, não um painel de frota. Calmo por definição, alto só quando é preciso.

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

**O herói é uma frase, não um gráfico:** *"A Maria está bem."* Quem abre isto às
3 da manhã quer uma resposta em palavras antes de qualquer dado.

**O elemento assinatura é o pulso:** um ponto que respira a cada sinal recebido
do telemóvel. Quando os sinais param, para de respirar e apaga. O silêncio passa
a ser visível — é o primeiro dos seis princípios feito interface.

`--alarme` só para alertas reais. Se aparecer em avisos de rotina, deixa de
significar alguma coisa.
