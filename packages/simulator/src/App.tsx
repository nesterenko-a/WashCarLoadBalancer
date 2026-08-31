/**
 * Оболочка симулятора по макету maket1.
 *
 * Будущие алгоритмы и типы потока показаны отключёнными: они будут активированы
 * после реализации в core, чтобы UI не имитировал несуществующую функциональность.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createAlgorithm, Dispatcher, generateArrivals, mulberry32, runSimulation, type CarWash, type SimConfig, type SimSnapshot, type SimulationResult, type VehicleSource, type VehicleType } from '@loadbalancer/core';
import './App.css';

const WASHES: CarWash[] = [
  { id: 'wash_a', name: 'Мойка A', coordinates: [1100, 1900], posts: 4, serviceTimeMin: { sedan: 8, truck: 25, bus: 40 }, supportedTypes: ['sedan', 'truck'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
  { id: 'wash_b', name: 'Мойка B', coordinates: [4750, 1900], posts: 3, serviceTimeMin: { sedan: 10, truck: 30, bus: 40 }, supportedTypes: ['sedan', 'truck', 'bus'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
  { id: 'wash_e', name: 'Мойка E', coordinates: [4550, 4400], posts: 5, serviceTimeMin: { sedan: 7, truck: 22, bus: 36 }, supportedTypes: ['sedan', 'truck', 'bus'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
];
const shares: Record<VehicleType, number> = { sedan: .6, truck: .3, bus: .1 };
/** Источники отражают схему road.txt: въезд и два внутренних цеха. */
const SOURCES: VehicleSource[] = [
  { id: 'entrance', name: 'Въезд с основной дороги', kind: 'entrance', coordinates: [3050, 5700] },
  { id: 'shop_1', name: 'Цех №1', kind: 'workshop', coordinates: [1250, 700] },
  { id: 'shop_2', name: 'Цех №2', kind: 'workshop', coordinates: [4850, 700] },
];
const algorithms = ['random', 'jsq', 'weighted_jsq'] as const;
type Algorithm = typeof algorithms[number];
const labels: Record<Algorithm, string> = { random: 'Random', jsq: 'JSQ — Shortest Queue', weighted_jsq: 'Weighted JSQ' };
const colors: Record<string, string> = { wash_a: '#2879df', wash_b: '#39a967', wash_e: '#e64d58' };
function formatTime(minutes: number) { const h = Math.floor(minutes / 60); const m = Math.floor(minutes % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`; }
function run(seed: number, algorithm: Algorithm, lambda: number, horizon: number) {
  const config: SimConfig = { seed, algorithm, distanceMetric: 'manhattan', avgSpeedKmh: 20, timeScale: 1 };
  const arrivals = generateArrivals({ lambdaBasePerMin: lambda, horizonMin: horizon, gridSizeMeters: 6000, typeShares: shares, sources: SOURCES }, mulberry32(seed));
  return runSimulation({ washes: WASHES, config, arrivals, recordSnapshots: true }, (w, c) => new Dispatcher(w, c, createAlgorithm(c.algorithm)));
}
function getSnapshot(result: SimulationResult, time: number) { return result.snapshots.reduce<SimSnapshot | undefined>((last, value) => value.time <= time ? value : last, undefined); }
/**
 * В snapshot пока нет значения Erlang C Wq. До расширения контракта
 * SimSnapshot UI показывает только наглядную оценку очереди; это не KPI.
 */
function visualWait(wash: CarWash, state?: SimSnapshot['washes'][number]) {
  return ((state?.queueLength ?? 0) / Math.max(wash.posts, 1)) * wash.serviceTimeMin.sedan;
}

export default function App() {
  const [seed, setSeed] = useState(42); const [lambda, setLambda] = useState(.5); const [horizon, setHorizon] = useState(120);
  const [selected, setSelected] = useState<Algorithm>('jsq'); const [results, setResults] = useState<Record<Algorithm, SimulationResult> | null>(null);
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(10);
  const [visibility, setVisibility] = useState({ roads: true, posts: true, queues: true, values: true });
  const active = results?.[selected]; const maxTime = active?.snapshots.at(-1)?.time ?? 0;
  const snapshot = useMemo(() => active && getSnapshot(active, time), [active, time]);
  const start = () => { const next = {} as Record<Algorithm, SimulationResult>; algorithms.forEach(a => next[a] = run(seed, a, lambda, horizon)); setResults(next); setTime(0); setPlaying(true); };
  const animation = useRef<number>();
  useEffect(() => { if (!playing || !active) return; let last = performance.now(); const loop = (now: number) => { setTime(old => { const next = Math.min(maxTime, old + (now - last) / 1000 * speed); if (next === maxTime) setPlaying(false); return next; }); last = now; animation.current = requestAnimationFrame(loop); }; animation.current = requestAnimationFrame(loop); return () => { if (animation.current) cancelAnimationFrame(animation.current); }; }, [active, maxTime, playing, speed]);
  const metrics = active?.metrics;
  return <div className="app">
    <header><h1>Симулятор распределения нагрузки между автомойками</h1><div className="header-controls">
      <label>Балансировщик <select value={selected} onChange={e => { setSelected(e.target.value as Algorithm); setTime(0); }}><option value="jsq">{labels.jsq}</option><option value="weighted_jsq">{labels.weighted_jsq}</option><option value="random">{labels.random}</option><option disabled>Power of Two Choices — скоро</option><option disabled>Round Robin — скоро</option></select></label>
      <button className="primary" onClick={start}>▶ Запуск</button><button disabled={!active} onClick={() => setPlaying(v => !v)}>{playing ? '❚❚ Пауза' : '▶ Продолжить'}</button><button onClick={() => { setTime(0); setPlaying(false); }}>↻ Сброс</button>
    </div></header>
    <main><aside className="sidebar"><Panel title="Настройки симуляции">
      <Field label="Длительность" value={formatTime(horizon)}><input type="number" min="30" max="1440" value={horizon} onChange={e => setHorizon(Number(e.target.value))}/></Field>
      <Field label="Шаг воспроизведения" value={`${speed} мин/с`}><select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="1">1 мин/с</option><option value="10">10 мин/с</option><option value="50">50 мин/с</option></select></Field>
      <Field label="Поток машин (λ)" value={`${(lambda * 60).toFixed(0)} машин/час`}><input className="range" type="range" min=".1" max="1.5" step=".1" value={lambda} onChange={e => setLambda(Number(e.target.value))}/></Field>
      <label className="select-field">Тип потока<select defaultValue="poisson"><option value="poisson">Пуассоновский</option><option disabled>Равномерный — скоро</option><option disabled>Пиковый — скоро</option><option disabled>Исторические данные — скоро</option></select></label>
      <label className="check"><input type="checkbox" checked readOnly/>Учитывать расстояние <span title="Отключение требует параметра в алгоритмах core.">ⓘ</span></label>
    </Panel><Panel title="Отображение">{(['roads', 'posts', 'queues', 'values'] as const).map(key => <label className="check" key={key}><input type="checkbox" checked={visibility[key]} onChange={e => setVisibility({ ...visibility, [key]: e.target.checked })}/>{{ roads:'Показывать дороги', posts:'Показывать посты', queues:'Показывать очереди', values:'Показывать значения' }[key]}</label>)}</Panel>
    <Panel title="Метрики системы (итог)"><Metric text="Обслужено машин" value={metrics ? String(metrics.completed) : '—'}/><Metric text="Среднее время ожидания" value={metrics ? `${metrics.avgWaitMin.toFixed(1)} мин` : '—'}/><Metric text="Средняя длина очереди" value={metrics ? (Object.values(active?.washMetrics ?? {}).reduce((sum, wash) => sum + wash.avgQueueLength, 0) / WASHES.length).toFixed(1) : '—'}/><Metric text="Загрузка системы (ρ)" value={metrics ? `${(metrics.avgRho * 100).toFixed(0)}%` : '—'}/><Metric text="Поток машин (λ)" value={`${(lambda * 60).toFixed(1)}/час`}/></Panel></aside>
    <section className="center"><div className="map"><Map snapshot={snapshot} visibility={visibility}/>{!active && <div className="empty">Выберите алгоритм и нажмите «Запуск»</div>}</div>{active && <Decision result={active} time={time}/>}<input className="timeline" type="range" min="0" max={maxTime || 1} step=".1" value={time} disabled={!active} onChange={e => setTime(Number(e.target.value))}/><div className="time-label"><span>{formatTime(time)}</span><span>{formatTime(maxTime)}</span></div>{active && <Table result={active} snapshot={snapshot}/>}</section>
    <aside className="right"><Panel title="Загрузка автомоек (ρ)">{WASHES.map(w => <Bar key={w.id} label={w.name.at(-1)!} value={snapshot?.washes.find(s => s.washId === w.id)?.rho ?? 0} color={colors[w.id]}/>)}</Panel><Panel title="Среднее время ожидания (Wq), мин"><Chart result={active} field="wait"/><Legend/></Panel><Panel title="Очереди (кол-во машин)"><Chart result={active} field="queue"/><Legend/></Panel></aside></main></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <label className="field"><span>{label}<b>{value}</b></span>{children}</label>; }
function Metric({ text, value }: { text: string; value: string }) { return <div className="metric"><span>{text}</span><b>{value}</b></div>; }
function Bar({ label, value, color }: { label: string; value: number; color: string }) { return <div className="bar"><span>{label}</span><div><i style={{ width: `${Math.min(value, 1) * 100}%`, background: color }}/></div><b>{value.toFixed(2)}</b></div>; }
function Legend() { return <div className="legend">{WASHES.map(w => <span key={w.id}><i style={{ background: colors[w.id] }}/>{w.name.at(-1)}</span>)}</div>; }
function Map({ snapshot, visibility }: { snapshot?: SimSnapshot; visibility: Record<'roads' | 'posts' | 'queues' | 'values', boolean> }) { return <div className="factory"><div className="river"/>{visibility.roads && <><div className="road horizontal"/><div className="road diagonal"/><div className="roundabout"/></>}<div className="main-road">ОСНОВНАЯ ДОРОГА</div>{SOURCES.map((source, index) => <div className={'source source-' + index} key={source.id}><b>{source.kind === 'entrance' ? '↥' : '▰'} {source.name}</b><small>{source.kind === 'entrance' ? 'поток снаружи' : 'внутренний поток'}</small></div>)}{WASHES.map((wash, index) => <Wash key={wash.id} wash={wash} state={snapshot?.washes.find(s => s.washId === wash.id)} color={colors[wash.id]} pos={index} visibility={visibility}/>)}</div>; }
function Wash({ wash, state, color, pos, visibility }: { wash: CarWash; state?: SimSnapshot['washes'][number]; color: string; pos: number; visibility: Record<'roads' | 'posts' | 'queues' | 'values', boolean> }) { const rho = state?.rho ?? 0; return <article className={`wash wash-${pos}`} style={{ '--wash': color } as React.CSSProperties}><header><b>▥ &nbsp;{wash.name}</b><span>Посты (c): {wash.posts}</span></header><div className="wash-body">{visibility.queues && <div className="queue"><b>Очередь ({state?.queueLength ?? 0})</b><div>{Array.from({ length: Math.min(state?.queueLength ?? 0, 6) }, (_, i) => <i key={i}/>)}</div></div>}{visibility.posts && <div className="posts"><b>Посты</b><div>{Array.from({ length: wash.posts }, (_, i) => <i key={i} className={i < (state?.busyPosts ?? 0) ? 'busy' : ''}/>)}</div></div>}{visibility.values && <div className="stats"><span>μ<b>{(60 / wash.serviceTimeMin.sedan).toFixed(1)}</b><small>маш/ч</small></span><span>λ<b>{(rho * wash.posts * 60 / wash.serviceTimeMin.sedan).toFixed(1)}</b><small>маш/ч</small></span><span>ρ<b className={rho > .9 ? 'danger' : ''}>{rho.toFixed(2)}</b></span><span title="Визуальная оценка, не Erlang C"><b>{visualWait(wash, state).toFixed(1)}</b><small>Wq*</small></span></div>}</div></article>; }
function Table({ result, snapshot }: { result: SimulationResult; snapshot?: SimSnapshot }) { return <section className="table-panel"><h2>Сводная таблица по автомойкам</h2><table><thead><tr><th>Мойка</th><th>Посты (c)</th><th>μ (маш/ч)</th><th>λ (маш/ч)</th><th>ρ</th><th>Wq* (мин)</th><th>Очередь</th><th>Обслужено</th></tr></thead><tbody>{WASHES.map(w => { const s = snapshot?.washes.find(x => x.washId === w.id); return <tr key={w.id}><td><i className="badge" style={{ background: colors[w.id] }}>{w.name.at(-1)}</i></td><td>{w.posts}</td><td>{(60 / w.serviceTimeMin.sedan).toFixed(1)}</td><td>{((s?.rho ?? 0) * w.posts * 60 / w.serviceTimeMin.sedan).toFixed(1)}</td><td>{(s?.rho ?? 0).toFixed(2)}</td><td title="Визуальная оценка, не Erlang C">{visualWait(w, s).toFixed(1)}</td><td>{s?.queueLength ?? 0}</td><td>{result.washMetrics[w.id]?.completed ?? 0}</td></tr>; })}</tbody></table></section>; }
function Decision({ result, time }: { result: SimulationResult; time: number }) {
  const decision = [...result.decisions].reverse().find(item => item.time <= time);
  if (!decision) return <div className="decision">Ожидание первой заявки…</div>;
  const request = result.requests.find(item => item.id === decision.requestId);
  const source = request?.vehicle.source?.name ?? 'неизвестный источник';
  return <div className="decision"><b>{source}</b><span>→ Balancer рассмотрел {Object.keys(decision.scores).map(id => WASHES.find(w => w.id === id)?.name.at(-1)).join(' / ')}</span><span>→ выбрана <strong>{WASHES.find(w => w.id === decision.chosenWash)?.name ?? 'нет мойки'}</strong> (score {decision.chosenScore?.toFixed(2) ?? '—'})</span></div>;
}
function Chart({ result, field }: { result?: SimulationResult; field: 'wait' | 'queue' }) { if (!result) return <div className="chart empty-chart">Данные появятся после запуска</div>; const points = result.snapshots.filter((_, i) => i % Math.max(1, Math.floor(result.snapshots.length / 30)) === 0); const max = Math.max(1, ...points.flatMap(s => s.washes.map(w => field === 'wait' ? visualWait(WASHES.find(x => x.id === w.washId)!, w) : w.queueLength))); return <svg className="chart" viewBox="0 0 260 110" preserveAspectRatio="none">{WASHES.map(w => <polyline key={w.id} fill="none" stroke={colors[w.id]} strokeWidth="2" points={points.map((s,i) => { const v=s.washes.find(x=>x.washId===w.id); const n=field==='wait'?visualWait(w, v):v?.queueLength??0; return `${i/Math.max(points.length-1,1)*260},${105-n/max*90}`; }).join(' ')}/>)}</svg>; }
