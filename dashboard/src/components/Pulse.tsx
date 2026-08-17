import { useEffect, useRef, useState } from 'react';

export type PulseState = 'ok' | 'alarme' | 'silencio';

interface PulseProps {
  state: PulseState;
  /** Muda sempre que chega um novo sinal — dispara a ondulação. */
  signalKey: number;
}

/**
 * O elemento assinatura do painel (Context.md §10): um ponto que respira a
 * cada sinal recebido do telemóvel. Quando os sinais param, para de respirar
 * e apaga — o silêncio fica visível, não só escrito.
 */
export function Pulse({ state, signalKey }: PulseProps) {
  const [rippleKey, setRippleKey] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) setRippleKey((k) => k + 1);
    mounted.current = true;
  }, [signalKey]);

  return (
    <div className={`pulse pulse--${state}`} role="img" aria-label={pulseLabel(state)}>
      <span className="pulse__ring" />
      <span key={rippleKey} className={`pulse__ripple ${rippleKey > 0 ? 'is-active' : ''}`} />
      <span className="pulse__core" />
    </div>
  );
}

function pulseLabel(state: PulseState): string {
  if (state === 'alarme') return 'Alerta ativo';
  if (state === 'silencio') return 'Sem sinal';
  return 'Sinal a chegar normalmente';
}
