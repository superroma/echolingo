import type { Echo } from '../types.js';
import type { EchoRepository } from './echo-repository.js';

export class InMemoryEchoRepository implements EchoRepository {
  private readonly map = new Map<string, Echo>();

  async get(id: string): Promise<Echo | null> {
    const found = this.map.get(id);
    return found ? structuredClone(found) : null;
  }

  async createIfAbsent(echo: Echo): Promise<Echo> {
    const existing = this.map.get(echo.id);
    if (existing) return structuredClone(existing);
    const stored = structuredClone(echo);
    this.map.set(echo.id, stored);
    return structuredClone(stored);
  }

  async update(id: string, mutator: (echo: Echo) => Echo): Promise<Echo> {
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Echo ${id} not found`);
    const next = mutator(structuredClone(existing));
    this.map.set(id, structuredClone(next));
    return structuredClone(next);
  }
}
