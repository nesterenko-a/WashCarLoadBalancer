/**
 * Публичный API ядра packages/core.
 */

export * from './domain/types.js';
export * from './rng/mulberry32.js';
export * from './math/erlang.js';
export * from './algorithms/index.js';
export * from './dispatcher/dispatcher.js';
export { runSimulation, type SimulationInput, type SimulationResult } from './sim/engine.js';
export { generateArrivals, type ArrivalGeneratorConfig } from './sim/arrivalGenerator.js';
export { type AggregateMetrics, type WashMetrics } from './metrics/aggregates.js';
