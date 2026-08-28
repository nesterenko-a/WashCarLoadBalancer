/**
 * Очередь событий с приоритетом по времени (min-heap).
 * DES-движок использует её для перехода от события к событию (NF-06).
 */

export interface TimedEvent {
  time: number;
}

export class EventQueue<T extends TimedEvent> {
  private readonly heap: T[] = [];

  get length(): number {
    return this.heap.length;
  }

  push(event: T): void {
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();
    const top = this.heap[0];
    const last = this.heap.pop() as T;
    this.heap[0] = last;
    this.bubbleDown(0);
    return top;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  private bubbleUp(idx: number): void {
    const event = this.heap[idx] as T;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx] as T;
      if (event.time < parent.time) {
        this.heap[idx] = parent;
        this.heap[parentIdx] = event;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number): void {
    const event = this.heap[idx] as T;
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && (this.heap[left] as T).time < (this.heap[smallest] as T).time) smallest = left;
      if (right < n && (this.heap[right] as T).time < (this.heap[smallest] as T).time) smallest = right;
      if (smallest === idx) break;
      this.heap[idx] = this.heap[smallest] as T;
      this.heap[smallest] = event;
      idx = smallest;
    }
  }
}
