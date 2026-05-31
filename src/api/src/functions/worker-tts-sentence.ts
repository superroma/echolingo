import { app } from '@azure/functions';
import type { TtsSentenceJob } from '../_shared/index.js';
import { getContext } from '../context.js';

export async function ttsSentenceWorker(job: TtsSentenceJob): Promise<void> {
  const ctx = getContext();
  const echo = await ctx.echoes.get(job.echoId);
  if (!echo) throw new Error(`Echo ${job.echoId} not found`);
  const sentence = echo.sentences[job.sentenceIndex];
  if (!sentence) {
    throw new Error(`Sentence ${job.sentenceIndex} not found in echo ${job.echoId}`);
  }
  if (sentence.status === 'ready') return;

  const grResult = await ctx.tts.synthesize({
    text: sentence.gr,
    lang: echo.params.targetLang,
  });
  const grUrl = await ctx.audio.put(job.echoId, job.sentenceIndex, 'gr', grResult.mp3);

  let nativeUrl: string | undefined;
  let nativeDurSec: number | undefined;
  if (echo.params.mode === 'bilingual') {
    const nativeResult = await ctx.tts.synthesize({
      text: sentence.native,
      lang: echo.params.nativeLang,
    });
    nativeUrl = await ctx.audio.put(job.echoId, job.sentenceIndex, 'native', nativeResult.mp3);
    nativeDurSec = nativeResult.durationSec;
  }

  await ctx.echoes.update(job.echoId, (e) => {
    const sentences = e.sentences.slice();
    const current = sentences[job.sentenceIndex];
    if (!current) return e;
    if (current.status === 'ready') return e;
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
      ...e,
      sentences,
      readySentences,
      status: readySentences === e.totalSentences ? 'ready' : 'generating_audio',
      updatedAt: new Date().toISOString(),
    };
  });

  const echoAfter = await ctx.echoes.get(job.echoId);
  if (echoAfter?.status === 'ready') {
    ctx.telemetry.emit({
      name: 'echo.audio_ready',
      properties: { echoId: job.echoId, totalSentences: echoAfter.totalSentences },
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
