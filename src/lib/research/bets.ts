import { parseLang, type Lang } from "../i18n/language.ts";

export function impliedProbability(american: number): number | null {
  if (!Number.isFinite(american) || american === 0 || Math.abs(american) < 100) return null;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function decimalOdds(american: number): number | null {
  const probability = impliedProbability(american);
  if (probability === null || probability <= 0 || probability >= 1) return null;
  return 1 / probability;
}

export function optionScenario(input: {
  side: "call" | "put" | "covered-call";
  strike: number;
  premium: number;
  sharePrice: number | null;
  lang?: Lang;
}): { ok: true; text: string } | { ok: false } {
  const { side, strike, premium, sharePrice } = input;
  const lang = parseLang(input.lang);
  if (![strike, premium].every((value) => Number.isFinite(value) && value > 0)) return { ok: false };
  if (side === "covered-call" && (sharePrice === null || !Number.isFinite(sharePrice) || sharePrice <= 0)) return { ok: false };
  const cost = premium * 100;
  if (side === "call") {
    return {
      ok: true,
      text:
        lang === "es"
          ? `Call larga educativa. El punto de equilibrio es ${(strike + premium).toFixed(2)} si la prima es ${premium.toFixed(2)}. La pérdida máxima es la prima, ${cost.toFixed(2)} por contrato. La ganancia máxima es ilimitada solo si el precio de la acción sigue subiendo. Esto no es un contrato cotizado.`
          : `Educational long call. Break-even is ${(strike + premium).toFixed(2)} if the premium is ${premium.toFixed(2)}. Maximum loss is the premium, ${cost.toFixed(2)} per contract. Maximum profit is unlimited only if the share price keeps rising. This is not a quoted contract.`,
    };
  }
  if (side === "put") {
    const maxGain = Math.max(strike - premium, 0) * 100;
    return {
      ok: true,
      text:
        lang === "es"
          ? `Put larga educativa. El punto de equilibrio es ${(strike - premium).toFixed(2)}. La pérdida máxima es la prima, ${cost.toFixed(2)} por contrato. La ganancia máxima si la acción llega a cero es ${maxGain.toFixed(2)} por contrato. Esto no es un contrato cotizado.`
          : `Educational long put. Break-even is ${(strike - premium).toFixed(2)}. Maximum loss is the premium, ${cost.toFixed(2)} per contract. Maximum gain if the share price goes to zero is ${maxGain.toFixed(2)} per contract. This is not a quoted contract.`,
    };
  }
  const paid = sharePrice ?? 0;
  const maxProfit = (strike - paid + premium) * 100;
  const maxLoss = (paid - premium) * 100;
  return {
    ok: true,
    text:
      lang === "es"
        ? `Call cubierta educativa. El punto de equilibrio de las acciones es ${(paid - premium).toFixed(2)}. La ganancia máxima ilustrada es ${maxProfit.toFixed(2)} por 100 acciones si se asignan al precio de ejercicio. La pérdida máxima ilustrada es ${maxLoss.toFixed(2)} si las acciones llegan a cero. No se revisó una cadena de opciones.`
        : `Educational covered call. Break-even on the shares is ${(paid - premium).toFixed(2)}. Illustrated maximum profit is ${maxProfit.toFixed(2)} per 100 shares if assigned at the strike. Illustrated maximum loss is ${maxLoss.toFixed(2)} if the shares go to zero. No option chain was checked.`,
  };
}

export function parlay(input: {
  legs: number[];
  stake: number;
  sameGame: boolean;
  lang?: Lang;
}): { ok: true; text: string } | { ok: false } {
  const lang = parseLang(input.lang);
  if (!Number.isFinite(input.stake) || input.stake <= 0 || input.legs.length < 2 || input.legs.length > 8) return { ok: false };
  const decimals: number[] = [];
  const chances: number[] = [];
  for (const leg of input.legs) {
    const price = decimalOdds(leg);
    const chance = impliedProbability(leg);
    if (price === null || chance === null) return { ok: false };
    decimals.push(price);
    chances.push(chance);
  }
  const combined = decimals.reduce((product, item) => product * item, 1);
  const payout = input.stake * combined;
  const profit = payout - input.stake;
  const american = combined >= 2 ? `+${Math.round((combined - 1) * 100)}` : `-${Math.round(100 / (combined - 1))}`;
  const independent = chances.reduce((product, item) => product * item, 1);
  const correlation = input.sameGame
    ? lang === "es"
      ? "Estas selecciones pueden estar correlacionadas. No se usa la probabilidad multiplicada."
      : "These selections can be correlated. The multiplied chance is not used."
    : lang === "es"
      ? `Si los precios fueran independientes, la probabilidad multiplicada sería ${(independent * 100).toFixed(1)}%. Agregar una selección suele reducir la probabilidad de ganar. Una casa puede cobrar un precio distinto.`
      : `If the prices were independent, the multiplied chance would be ${(independent * 100).toFixed(1)}%. Adding a selection usually lowers the chance of winning. A book may charge a different price.`;
  const lead =
    lang === "es"
      ? `Cuotas americanas combinadas ${american}. Con una apuesta de ${input.stake.toFixed(2)}, el pago multiplicado es ${payout.toFixed(2)} y la ganancia neta es ${profit.toFixed(2)}.`
      : `Stacked American prices ${american}. On a ${input.stake.toFixed(2)} stake, the multiplied payout is ${payout.toFixed(2)} and the net profit is ${profit.toFixed(2)}.`;
  const close = lang === "es" ? "Esto no es una apuesta ni una garantía." : "This is not a wager and it is not a guarantee.";
  return { ok: true, text: `${lead} ${correlation} ${close}` };
}
