/**
 * Формула Erlang C (раздел 3.3, Приложение А спецификации).
 * Численная устойчивость — рекуррентное вычисление Erlang B без факториалов.
 *
 * lambda и mu задаются в одинаковых единицах (напр. заявок/мин);
 * expectedWait возвращает время в единицах 1/mu.
 */

/** Вероятность ожидания P_wait в системе M/M/c. При rho >= 1 система нестабильна → 1.0. */
export function erlangC(lambda: number, mu: number, c: number): number {
  if (lambda < 0 || mu <= 0 || c < 1) {
    throw new Error(`erlangC: некорректные параметры (lambda=${lambda}, mu=${mu}, c=${c})`);
  }
  const rho = lambda / (c * mu);
  if (rho >= 1) return 1.0;

  // Erlang B (вероятность блокировки) — рекуррентно
  let erlangB = 1.0;
  for (let k = 1; k <= c; k++) {
    erlangB = (rho * c * erlangB) / (k + rho * c * erlangB);
  }

  return erlangB / (1 - rho + rho * erlangB);
}

/** Среднее время ожидания W_q = P_wait / (c·mu − lambda). При rho >= 1 → Infinity. */
export function expectedWait(lambda: number, mu: number, c: number): number {
  const rho = lambda / (c * mu);
  if (rho >= 1) return Infinity;
  const pw = erlangC(lambda, mu, c);
  return pw / (c * mu - lambda);
}

/**
 * Эффективная интенсивность обслуживания μ̄ — гармоническое среднее
 * по долям типов ТС в потоке (раздел 3.4):
 *   μ̄ = 1 / Σ_t (p_t · T_service,t)
 * serviceTimeMin — средние времена мойки (мин), shares — доли типов (сумма ≈ 1).
 */
export function effectiveMu(
  serviceTimeMin: { sedan: number; truck: number; bus: number },
  shares: { sedan: number; truck: number; bus: number },
): number {
  const totalShare = shares.sedan + shares.truck + shares.bus;
  if (totalShare <= 0) {
    throw new Error('effectiveMu: сумма долей типов должна быть > 0');
  }
  const meanService =
    (shares.sedan * serviceTimeMin.sedan +
      shares.truck * serviceTimeMin.truck +
      shares.bus * serviceTimeMin.bus) /
    totalShare;
  if (meanService <= 0) {
    throw new Error('effectiveMu: среднее время обслуживания должно быть > 0');
  }
  return 1 / meanService;
}
