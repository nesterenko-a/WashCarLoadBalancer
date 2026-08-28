/**
 * Доменная модель (раздел 8.1 спецификации).
 * Все времена в минутах, координаты в метрах.
 */

/** Симуляционное время: минуты от начала прогона. */
export type SimTime = number;

export type VehicleType = 'sedan' | 'truck' | 'bus';
export type Priority = 'urgent' | 'normal' | 'scheduled';

/** T_service по типам ТС (мин). */
export interface ServiceTimes {
  sedan: number;
  truck: number;
  bus: number;
}

/** Режим работы мойки (на этапе 1 считается 24/7). */
export interface WorkSchedule {
  openHour: number; // 0–23
  closeHour: number; // 0–23, 24 = круглосуточно
}

export interface CarWash {
  id: string;
  name: string;
  coordinates: [x: number, y: number];
  posts: number; // c — количество постов
  serviceTimeMin: ServiceTimes;
  supportedTypes: VehicleType[]; // какие ТС обслуживает (F-07)
  isActive: boolean;
  schedule: WorkSchedule;
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  priority: Priority;
  arrivalTime: SimTime;
  location: [x: number, y: number];
}

export interface WashRequest {
  id: string;
  vehicle: Vehicle;
  targetWash: string | null; // null — отказ (F-12)
  algorithm: string; // каким алгоритмом назначена
  assignedAt: SimTime;
  arrivedAt?: SimTime; // прибытие на мойку
  startedAt?: SimTime; // начало мойки
  completedAt?: SimTime; // завершение
}

export interface WashState {
  washId: string;
  timestamp: SimTime;
  queueLength: number; // L_q
  busyPosts: number;
  inTransit: number; // n_transit — назначены, ещё едут
  currentLambda: number; // λ за последние 15 мин (заявок/мин)
  rho: number; // коэффициент загрузки
  expectedWaitMin: number; // W_q по Erlang C с μ̄
}

/** Веса для State-Aware Score (этап 2); в SimConfig заложены заранее. */
export interface ScoreWeights {
  alpha: number; // ожидание
  beta: number; // путь
  gamma: number; // обслуживание
  delta: number; // загрузка
  epsilon?: number; // штраф за перегрузку
}

export interface SimConfig {
  seed: number; // детерминизм (NF-10)
  algorithm: string; // имя алгоритма из раздела 7
  distanceMetric: 'manhattan' | 'euclidean';
  avgSpeedKmh: number; // по умолчанию 20
  algorithmWeights?: ScoreWeights;
  timeScale: number; // 1x–1000x (только для визуального режима)
}
