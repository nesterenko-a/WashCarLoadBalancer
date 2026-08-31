import { describe, expect, it } from 'vitest';
import { effectiveMu, erlangC, expectedWait } from '../src/math/erlang.js';

/**
 * Unit-тесты Erlang C против табличных значений спецификации (раздел 12.3).
 * Значения даны для ρ = 0.8.
 */
describe('erlangC', () => {
  it('возвращает табличные P_wait при ρ = 0.8', () => {
    expect(erlangC(8, 5, 2)).toBeCloseTo(0.711, 3);
    expect(erlangC(12, 5, 3)).toBeCloseTo(0.647, 3);
    expect(erlangC(16, 5, 4)).toBeCloseTo(0.596, 3);
  });

  it('возвращает 1.0 при нестабильной системе (ρ >= 1)', () => {
    expect(erlangC(10, 5, 2)).toBe(1.0); // rho = 1.0
    expect(erlangC(20, 5, 2)).toBe(1.0); // rho > 1
  });

  it('бросает при некорректных параметрах', () => {
    expect(() => erlangC(-1, 5, 2)).toThrow();
    expect(() => erlangC(8, 0, 2)).toThrow();
    expect(() => erlangC(8, 5, 0)).toThrow();
  });

  it('ожидаемое время ожидания растёт при увеличении ρ', () => {
    const w80 = expectedWait(8, 5, 2);
    const w50 = expectedWait(5, 5, 2);
    expect(w80).toBeGreaterThan(w50);
    expect(Number.isFinite(w80)).toBe(true);
  });

  it('expectedWait = Infinity при rho >= 1', () => {
    expect(expectedWait(10, 5, 2)).toBe(Infinity);
  });
});

describe('effectiveMu', () => {
  it('гармоническое среднее по долям типов', () => {
    const mu = effectiveMu({ sedan: 8, truck: 25, heavy_truck: 35, bus: 40 }, { sedan: 0.5, truck: 0.2, heavy_truck: 0.1, bus: 0.2 });
    const expected = 1 / (0.5 * 8 + 0.2 * 25 + 0.1 * 35 + 0.2 * 40);
    expect(mu).toBeCloseTo(expected, 10);
  });

  it('бросает при нулевой сумме долей', () => {
    expect(() => effectiveMu({ sedan: 8, truck: 25, heavy_truck: 35, bus: 40 }, { sedan: 0, truck: 0, heavy_truck: 0, bus: 0 })).toThrow();
  });
});
