import test from 'node:test';
import assert from 'node:assert/strict';
import { createFallDetector, FALL_DEFAULTS } from './fallDetection.js';

/** Alimenta o detetor com uma sequência de (g, ms) e diz se disparou. */
function feed(samples: [number, number][]): boolean {
  const detector = createFallDetector();
  return samples.some(([g, at]) => detector.push(g, at));
}

test('um dia normal a 1 g não dispara nada', () => {
  const samples: [number, number][] = [];
  for (let i = 0; i < 200; i++) samples.push([1 + Math.sin(i) * 0.15, i * 50]);
  assert.equal(feed(samples), false);
});

test('queda livre seguida de impacto é uma queda', () => {
  assert.equal(
    feed([
      [1.0, 0],
      [0.2, 50], // queda livre
      [0.1, 100],
      [3.0, 300], // impacto
    ]),
    true,
  );
});

test('impacto sem queda livre antes não conta — é o telemóvel pousado com força', () => {
  assert.equal(
    feed([
      [1.0, 0],
      [1.1, 50],
      [3.5, 100],
      [1.0, 150],
    ]),
    false,
  );
});

test('queda livre sem impacto dentro da janela não conta — foi atirado para o sofá', () => {
  const tarde = FALL_DEFAULTS.windowMs + 500;
  assert.equal(
    feed([
      [1.0, 0],
      [0.2, 50],
      [1.0, 500],
      [3.0, tarde],
    ]),
    false,
  );
});

test('o relógio conta desde o início da queda livre, não desde a última leitura baixa', () => {
  // Queda livre longa: se o relógio reiniciasse a cada leitura baixa, o
  // impacto tardio passaria por bom.
  const samples: [number, number][] = [[1.0, 0]];
  for (let t = 50; t <= FALL_DEFAULTS.windowMs; t += 50) samples.push([0.2, t]);
  samples.push([3.0, FALL_DEFAULTS.windowMs + 100]);
  assert.equal(feed(samples), false);
});

test('depois de disparar, recomeça do zero — um impacto solto a seguir não redispara', () => {
  const detector = createFallDetector();
  assert.equal(detector.push(0.2, 0), false);
  assert.equal(detector.push(3.0, 200), true);
  assert.equal(detector.push(3.0, 400), false, 'sem nova queda livre não há nova queda');
});
