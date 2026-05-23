import { app } from '@azure/functions';
import type { TtsSentenceJob } from '../_shared/index.js';
import { getContext } from '../context.js';

export async function ttsSentenceWorker(job: TtsSentenceJob): Promise<void> {
  const ctx = getContext();
  const lesson = await ctx.lessons.get(job.lessonId);
  if (!lesson) throw new Error(`Lesson ${job.lessonId} not found`);
  const sentence = lesson.sentences[job.sentenceIndex];
  if (!sentence) {
    throw new Error(`Sentence ${job.sentenceIndex} not found in lesson ${job.lessonId}`);
  }
  if (sentence.status === 'ready') return;

  const grResult = await ctx.tts.synthesize({
    text: sentence.gr,
    lang: lesson.params.targetLang,
  });
  const grUrl = await ctx.audio.put(job.lessonId, job.sentenceIndex, 'gr', grResult.mp3);

  let nativeUrl: string | undefined;
  let nativeDurSec: number | undefined;
  if (lesson.params.mode === 'bilingual') {
    const nativeResult = await ctx.tts.synthesize({
      text: sentence.native,
      lang: lesson.params.nativeLang,
    });
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

  const lessonAfter = await ctx.lessons.get(job.lessonId);
  if (lessonAfter?.status === 'ready') {
    ctx.telemetry.emit({
      name: 'lesson.audio_ready',
      properties: { lessonId: job.lessonId, totalSentences: lessonAfter.totalSentences },
    });
  }
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
