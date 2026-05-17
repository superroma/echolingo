import { app } from '@azure/functions';
import type { TtsSentenceJob } from '@echolingo/shared';
import { getContext } from '../context.js';

const LANG_BY_NATIVE = { en: 'en', ru: 'ru' } as const;

export async function ttsSentenceWorker(job: TtsSentenceJob): Promise<void> {
  const ctx = getContext();
  const lesson = await ctx.lessons.get(job.lessonId);
  if (!lesson) throw new Error(`Lesson ${job.lessonId} not found`);
  const sentence = lesson.sentences[job.sentenceIndex];
  if (!sentence) {
    throw new Error(`Sentence ${job.sentenceIndex} not found in lesson ${job.lessonId}`);
  }
  if (sentence.status === 'ready') return;

  const grResult = await ctx.tts.synthesize({ text: sentence.gr, lang: 'el' });
  const grUrl = await ctx.audio.put(job.lessonId, job.sentenceIndex, 'gr', grResult.mp3);

  let nativeUrl: string | undefined;
  let nativeDurSec: number | undefined;
  if (lesson.params.mode === 'bilingual') {
    const nativeLang = LANG_BY_NATIVE[lesson.params.nativeLang];
    const nativeResult = await ctx.tts.synthesize({ text: sentence.native, lang: nativeLang });
    nativeUrl = await ctx.audio.put(job.lessonId, job.sentenceIndex, 'native', nativeResult.mp3);
    nativeDurSec = nativeResult.durationSec;
  }

  await ctx.lessons.update(job.lessonId, (l) => {
    const sentences = l.sentences.slice();
    const current = sentences[job.sentenceIndex];
    if (!current) return l;
    if (current.status === 'ready') return l;
    sentences[job.sentenceIndex] = {
      ...current,
      status: 'ready',
      grUrl,
      grDurSec: grResult.durationSec,
      nativeUrl,
      nativeDurSec,
    };
    const readySentences = sentences.filter((s) => s.status === 'ready').length;
    return {
      ...l,
      sentences,
      readySentences,
      status: readySentences === l.totalSentences ? 'ready' : 'generating_audio',
      updatedAt: new Date().toISOString(),
    };
  });
}

app.storageQueue('ttsSentenceWorker', {
  queueName: 'tts-sentence',
  connection: 'AzureWebJobsStorage',
  handler: async (rawMessage) => {
    const job = decodeJob(rawMessage);
    await ttsSentenceWorker(job);
  },
});

function decodeJob(raw: unknown): TtsSentenceJob {
  if (typeof raw === 'object' && raw !== null) return raw as TtsSentenceJob;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as TtsSentenceJob;
    } catch {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded) as TtsSentenceJob;
    }
  }
  throw new Error('unrecognized queue message shape');
}
