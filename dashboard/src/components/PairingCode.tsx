/**
 * Fica visível até o cuidador dizer que já emparelhou — nunca se esconde
 * sozinho. O código é o único propósito deste ecrã; trocá-lo por outro antes
 * de tempo (por exemplo, assim que a lista de dispositivos atualiza em
 * segundo plano) tornaria impossível voltar a lê-lo.
 */
export function PairingCode({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="card pairing-card">
      <div className="pairing-card__title">Introduza este código na app</div>
      <p className="pairing-card__body">
        Abra a app no telemóvel de quem vai usar o SOS Mendonça e introduza o código abaixo. Válido por 15 minutos.
      </p>
      <div className="pairing-code mono">{code}</div>
      <div>
        <button className="button button--ghost" style={{ marginTop: 4 }} onClick={onDone}>
          Já emparelhei
        </button>
      </div>
    </div>
  );
}
