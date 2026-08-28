# Quick Start — Load Balancer

> Самый быстрый путь от `git clone` до работающего симулятора.

## Требования

- **Node.js** ≥ 20 (рекомендуется LTS)
- **pnpm** ≥ 9 (активация через `corepack enable`)
- Git

## 1. Установка

```bash
git clone https://github.com/nesterenko-a/WashCarLoadBalancer.git
cd WashCarLoadBalancer

corepack enable
pnpm install
```

Если `corepack` недоступен:

```bash
npm install -g pnpm
pnpm install
```

## 2. Проверка, что всё собралось

```bash
pnpm -r typecheck
pnpm -r test
```

Ожидаемый результат: обе команды завершаются без ошибок.

## 3. Headless-прогон

Сравнение трёх алгоритмов (Random, JSQ, Weighted JSQ) на одном seed:

```bash
pnpm --filter @loadbalancer/core run:headless 42
```

Результат — таблица метрик и три CSV-файла:

```text
decisions-random.csv
decisions-jsq.csv
decisions-weighted_jsq.csv
```

> Эти файлы генерируются заново при каждом запуске и не коммитятся.

## 4. Запуск визуального симулятора

```bash
pnpm --filter @loadbalancer/simulator dev
```

Открой в браузере: http://localhost:5173/

В UI можно:

- задать seed;
- запустить все три алгоритма на одних и тех же входных данных;
- сравнить метрики в таблице;
- переключать карту между алгоритмами и видеть загрузку каждой мойки;
- нажать **Play** и смотреть анимацию движения машин к мойкам;
- менять скорость воспроизведения (1x/5x/10x/50x) и перематывать слайдером времени;
- видеть текущую очередь, занятые посты и машины в пути на Canvas.

## 5. Как устроено сравнение алгоритмов

Симулятор и будущий production-диспетчер работают на одном ядре — `packages/core`. Это даёт три важных свойства.

### 5.1. Один поток заявок для всех алгоритмов

Когда ты нажимаешь **«Запустить все три алгоритма»**, симулятор трижды проигрывает **один и тот же сценарий**:

```ts
const ALGORITHMS = ['random', 'jsq', 'weighted_jsq'] as const;

for (const algo of ALGORITHMS) {
  results[algo] = runSimulation(
    { washes, config: { ...config, algorithm: algo }, arrivals, recordSnapshots: true },
    (_, cfg, rng) => new Dispatcher(washes, cfg, createAlgorithm(cfg.algorithm))
  );
}
```

`seed`, `lambdaBase`, `horizonMin`, `peakWindows` и расположение моек не меняются. Меняется только стратегия выбора мойки.

### 5.2. Визуализация не знает об алгоритме

Компоненты `MapCanvas`, `MetricsPanel` и `ComparisonTable` принимают только готовый `SimulationResult`. Они не вызывают алгоритм и не зависят от его имени:

```tsx
<MapCanvas result={results[selected]} currentTime={currentTime} />
<MetricsPanel result={results[selected]} currentTime={currentTime} />
```

Поэтому переключение между Random, JSQ и Weighted JSQ в playback — это просто смена `selected`-состояния. Данные уже в памяти, пересчёт не требуется.

### 5.3. Почему сравнение честное

Разница в метриках между алгоритмами объясняется **только** логикой балансировки:

- одинаковые входные данные;
- одинаковые мойки и дорожная сеть;
- одинаковый seeded PRNG;
- одинаковая модель обслуживания в DES-движке.

Если Weighted JSQ показывает Score 75, а Random — 35, это означает, что именно стратегия выбора мойки улучшила ситуацию, а не «повезло» с потоком машин.

### 5.4. Как добавить четвёртый алгоритм

1. Реализуй класс в `packages/core/src/algorithms/`, реализующий интерфейс `LoadBalancingAlgorithm`.
2. Зарегистрируй его в `createAlgorithm(name)` в `packages/core/src/algorithms/index.ts`.
3. Добавь имя в массив `ALGORITHMS` в `packages/simulator/src/App.tsx`.

После этого новый алгоритм автоматически появится в таблице сравнения и в playback без изменения визуальных компонентов.

## 6. Структура репозитория

```text
packages/
├── core/          # ядро: DES, диспетчер, алгоритмы, метрики, PRNG
├── simulator/     # React + Vite + Canvas — визуальное сравнение
└── api/           # REST API (этап 5, пока не реализован)
docs/
├── SPECIFICATION.md     # техническое задание
├── PROJECT_RULES.md     # правила ведения проекта
└── QUICKSTART.md        # этот файл
```

## 7. Частые команды

| Команда | Назначение |
|---|---|
| `pnpm install` | Установить/обновить зависимости |
| `pnpm -r test` | Запустить все тесты |
| `pnpm -r typecheck` | Проверить TypeScript во всех пакетах |
| `pnpm --filter @loadbalancer/core run:headless <seed>` | Headless-прогон |
| `pnpm --filter @loadbalancer/simulator dev` | Dev-сервер симулятора |
| `pnpm --filter @loadbalancer/simulator build` | Production-сборка симулятора |

## 8. Если что-то пошло не так

- `pnpm install` падает на `esbuild` — запусти `pnpm approve-builds esbuild`, затем `pnpm rebuild esbuild`.
- `test:coverage` падает на threshold'ах — это известно, основные unit-тесты проходят; покрытие edge-case'ов дорабатывается.

---

*Последнее обновление: 2026-08-29*
