import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/domain/types.ts'], // только type-only интерфейсы
      // scripts/ — CLI-обвязка вне src, в покрытие не входит
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // NF-12: Erlang C и диспетчер — 100%
        'src/math/erlang.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/dispatcher/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
