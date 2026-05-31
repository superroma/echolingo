import type { Echo } from '../types.js';

export interface EchoRepository {
  get(id: string): Promise<Echo | null>;
  createIfAbsent(echo: Echo): Promise<Echo>;
  update(id: string, mutator: (echo: Echo) => Echo): Promise<Echo>;
}
