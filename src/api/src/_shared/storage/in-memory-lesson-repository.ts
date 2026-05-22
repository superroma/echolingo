import type { Lesson } from '../types.js';
import type { LessonRepository } from './lesson-repository.js';

export class InMemoryLessonRepository implements LessonRepository {
  private readonly map = new Map<string, Lesson>();

  async get(id: string): Promise<Lesson | null> {
    const found = this.map.get(id);
    return found ? structuredClone(found) : null;
  }

  async createIfAbsent(lesson: Lesson): Promise<Lesson> {
    const existing = this.map.get(lesson.id);
    if (existing) return structuredClone(existing);
    const stored = structuredClone(lesson);
    this.map.set(lesson.id, stored);
    return structuredClone(stored);
  }

  async update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson> {
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Lesson ${id} not found`);
    const next = mutator(structuredClone(existing));
    this.map.set(id, structuredClone(next));
    return structuredClone(next);
  }
}
