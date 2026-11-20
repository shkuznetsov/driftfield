type Handler<P> = (payload: P) => void;

/** Minimal typed event emitter. */
export class Emitter<E> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    const target = set;
    target.add(fn as Handler<never>);
    return () => {
      target.delete(fn as Handler<never>);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as unknown as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
