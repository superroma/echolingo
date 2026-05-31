export interface ScriptGenJob {
  type: 'scriptGen';
  echoId: string;
}

export interface TtsSentenceJob {
  type: 'ttsSentence';
  echoId: string;
  sentenceIndex: number;
}

export type Job = ScriptGenJob | TtsSentenceJob;
