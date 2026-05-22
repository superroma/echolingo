export interface ScriptGenJob {
  type: 'scriptGen';
  lessonId: string;
}

export interface TtsSentenceJob {
  type: 'ttsSentence';
  lessonId: string;
  sentenceIndex: number;
}

export type Job = ScriptGenJob | TtsSentenceJob;
