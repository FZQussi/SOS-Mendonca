/**
 * Regras de interface para o idoso (Context.md §10 / skill interface-para-idosos).
 * Toque ≥ 60 dp, texto ≥ 18 sp, contraste ≥ 7:1. O SOS é a exceção a tudo:
 * maior, mais alto, sozinho no ecrã.
 */
export const colors = {
  tinta: '#14304A',
  tintaSuave: '#4A6480',
  parede: '#E9EDEF',
  louca: '#FFFFFF',
  azulejo: '#2F6F9E',
  musgo: '#3F7A5A',
  alarme: '#C4362C',
  areia: '#DED6C8',
};

export const type = {
  base: 22,
  botao: 26,
  titulo: 30,
  sos: 34,
};

export const touch = {
  minimo: 60,
  sos: 120,
};

export const space = {
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48,
};
