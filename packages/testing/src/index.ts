export interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value | PromiseLike<Value>) => void;
  readonly reject: (reason?: unknown) => void;
}

export function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise!: Deferred<Value>['resolve'];
  let rejectPromise!: Deferred<Value>['reject'];
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export function createFixedClock(isoTimestamp: string): () => Date {
  const timestamp = new Date(isoTimestamp);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Test clock timestamp must be a valid ISO date');
  }

  return () => new Date(timestamp.getTime());
}
