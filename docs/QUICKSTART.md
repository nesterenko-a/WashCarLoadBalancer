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

## 5. Структура репозитория

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

## 6. Частые команды

| Команда | Назначение |
|---|---|
| `pnpm install` | Установить/обновить зависимости |
| `pnpm -r test` | Запустить все тесты |
| `pnpm -r typecheck` | Проверить TypeScript во всех пакетах |
| `pnpm --filter @loadbalancer/core run:headless <seed>` | Headless-прогон |
| `pnpm --filter @loadbalancer/simulator dev` | Dev-сервер симулятора |
| `pnpm --filter @loadbalancer/simulator build` | Production-сборка симулятора |

## 7. Если что-то пошло не так

- `pnpm install` падает на `esbuild` — запусти `pnpm approve-builds esbuild`, затем `pnpm rebuild esbuild`.
- `test:coverage` падает на threshold'ах — это известно, основные unit-тесты проходят; покрытие edge-case'ов дорабатывается.

---

*Последнее обновление: 2026-08-28*
