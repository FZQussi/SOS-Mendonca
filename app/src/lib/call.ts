import Constants from 'expo-constants';

/**
 * `react-native-background-geolocation` e este módulo de chamada direta são
 * nativos puros — não existem na sandbox do Expo Go, só num development
 * build (`npx expo run:android` ou EAS). Se tentares fazer `import` estático
 * do pacote aqui, o Expo Go rebenta ao abrir a app, mesmo em ecrãs que nunca
 * chamam esta função. Por isso o `require` só acontece dentro da função, e só
 * fora do Expo Go.
 */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

/**
 * Liga diretamente ao número, sem passar pelo marcador (`Linking` abre o
 * marcador, não liga — Context.md §7). É o primeiro passo do SOS, antes de
 * qualquer `await` de rede ou GPS (princípio 2).
 */
export function callDirectly(phoneNumber: string): void {
  if (isExpoGo()) {
    console.warn('[call] Chamada direta não funciona no Expo Go — precisa de um development build.');
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: ImmediatePhoneCall } = require('react-native-immediate-phone-call');
  ImmediatePhoneCall.immediatePhoneCall(phoneNumber);
}
