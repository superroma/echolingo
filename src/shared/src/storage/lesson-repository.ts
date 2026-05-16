import type { Lesson } from '../types.js';

export interface LessonRepository {
  get(id: string): Promise<Lesson | null>;
  createIfAbsent(lesson: Lesson): Promise<Lesson>;
  update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson>;
}
