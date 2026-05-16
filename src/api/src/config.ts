export const DEFAULT_LESSON_CONTAINER = 'lessons';
export const DEFAULT_AUDIO_CONTAINER = 'audio';
export const DEFAULT_SCRIPT_GEN_QUEUE = 'script-gen';
export const DEFAULT_TTS_SENTENCE_QUEUE = 'tts-sentence';

export interface Config {
  storageConnectionString: string;
  lessonsContainer: string;
  audioContainer: string;
  scriptGenQueue: string;
  ttsSentenceQueue: string;
}

export function loadConfig(): Config {
  const storageConnectionString = process.env.AzureWebJobsStorage;
  if (!storageConnectionString) {
    throw new Error('AzureWebJobsStorage environment variable is required');
  }
  return {
    storageConnectionString,
    lessonsContainer: process.env.LESSONS_CONTAINER ?? DEFAULT_LESSON_CONTAINER,
    audioContainer: process.env.AUDIO_CONTAINER ?? DEFAULT_AUDIO_CONTAINER,
    scriptGenQueue: process.env.SCRIPT_GEN_QUEUE ?? DEFAULT_SCRIPT_GEN_QUEUE,
    ttsSentenceQueue: process.env.TTS_SENTENCE_QUEUE ?? DEFAULT_TTS_SENTENCE_QUEUE,
  };
}
