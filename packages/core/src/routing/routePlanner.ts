/**
 * Маршрутизация по графу дорог предприятия.
 * Граф и планировщик передаются извне: core не зависит от конкретной карты UI.
 */
import type { CarWash, RoutePlan, Vehicle } from '../domain/types.js';

export interface RoadNode {
  id: string;
  coordinates: [x: number, y: number];
}

export interface RoadEdge {
  from: string;
  to: string;
  /** Если не задано, берётся евклидово расстояние между узлами. */
  distanceMeters?: number;
}

export interface RoadGraph {
  nodes: readonly RoadNode[];
  edges: readonly RoadEdge[];
}

export interface RoutePlanner {
  plan(vehicle: Vehicle, wash: CarWash): RoutePlan;
}

export function createRoadGraphPlanner(graph: RoadGraph): RoutePlanner {
  const nodes = new Map(graph.nodes.map(node => [node.id, node] as const));
  const neighbours = new Map<string, { id: string; distance: number }[]>();
  for (const node of graph.nodes) neighbours.set(node.id, []);
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new Error(`Unknown road node in edge: ${edge.from} → ${edge.to}`);
    const distance = edge.distanceMeters ?? euclidean(from.coordinates, to.coordinates);
    neighbours.get(from.id)!.push({ id: to.id, distance });
    neighbours.get(to.id)!.push({ id: from.id, distance });
  }

  return {
    plan(vehicle, wash) {
      const startId = vehicle.source?.id ?? nearestNode(vehicle.location, graph.nodes).id;
      const start = nodes.get(startId);
      const target = nodes.get(wash.id);
      if (!start || !target) return directRoute(vehicle, wash);
      const result = shortestPath(start.id, target.id, neighbours);
      if (!result) return directRoute(vehicle, wash);
      return {
        points: result.path.map(id => {
          const node = nodes.get(id)!;
          return { id: node.id, coordinates: node.coordinates };
        }),
        distanceMeters: result.distance,
      };
    },
  };
}

function shortestPath(start: string, target: string, neighbours: ReadonlyMap<string, readonly { id: string; distance: number }[]>) {
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(neighbours.keys());
  while (unvisited.size > 0) {
    let current: string | undefined;
    let best = Infinity;
    for (const id of unvisited) {
      const distance = distances.get(id) ?? Infinity;
      if (distance < best) { current = id; best = distance; }
    }
    if (!current || current === target) break;
    unvisited.delete(current);
    for (const edge of neighbours.get(current) ?? []) {
      if (!unvisited.has(edge.id)) continue;
      const next = best + edge.distance;
      if (next < (distances.get(edge.id) ?? Infinity)) {
        distances.set(edge.id, next);
        previous.set(edge.id, current);
      }
    }
  }
  const distance = distances.get(target);
  if (distance === undefined) return null;
  const path = [target];
  let cursor = target;
  while (cursor !== start) {
    const parent = previous.get(cursor);
    if (!parent) return null;
    path.unshift(parent);
    cursor = parent;
  }
  return { path, distance };
}

function directRoute(vehicle: Vehicle, wash: CarWash): RoutePlan {
  return { points: [{ id: 'source', coordinates: vehicle.location }, { id: wash.id, coordinates: wash.coordinates }], distanceMeters: euclidean(vehicle.location, wash.coordinates) };
}
function nearestNode(point: [number, number], nodes: readonly RoadNode[]): RoadNode {
  if (nodes.length === 0) throw new Error('Road graph must contain at least one node');
  return nodes.reduce((best, node) => euclidean(point, node.coordinates) < euclidean(point, best.coordinates) ? node : best);
}
function euclidean(a: [number, number], b: [number, number]) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
