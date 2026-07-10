import { randomUUID } from 'node:crypto';

export interface ConnectionRegistration {
  readonly connectionId: string;
}

export class ConnectionRegistry {
  readonly #connectionIds = new Set<string>();

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Connection limit must be a positive integer.');
    }
  }

  get size(): number {
    return this.#connectionIds.size;
  }

  get isFull(): boolean {
    return this.size >= this.limit;
  }

  register(): ConnectionRegistration | undefined {
    if (this.isFull) {
      return undefined;
    }

    const connectionId = randomUUID();
    this.#connectionIds.add(connectionId);
    return { connectionId };
  }

  release(connectionId: string): boolean {
    return this.#connectionIds.delete(connectionId);
  }
}
