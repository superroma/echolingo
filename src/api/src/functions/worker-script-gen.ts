import { app } from '@azure/functions';
import { buildPrompt, parseScript, type ScriptGenJob } from '@echolingo/shared';
import { getContext } from '../context.js';

export async function scriptGenWorker(job: ScriptGenJob): Promise<void> {
  const ctx = getContext();
  const lesson = await ctx.lessons.get(job.lessonId);
  if (!lesson) throw new Error(`Lesson ${job.lessonId} not found`);
  if (lesson.status !== 'generating_script') return;

  try {
    const prompt = buildPrompt(lesson.params);
    const raw = await ctx.llm.generateScript(prompt);
    const sentences = parseScript(raw);
    if (sentences.length === 0) {
      throw new Error('empty script: parseScript returned no sentences');
    }

    await ctx.lessons.update(job.lessonId, (l) => ({
      ...l,
      status: 'generating_audio',
      sentences,
      totalSentences: sentences.length,
      readySentences: 0,
      updatedAt: new Date().toISOString(),
    }));

    await Promise.all(
      sentences.map((s) =>
        ctx.queue.enqueueTtsSentence({
          type: 'ttsSentence',
          lessonId: job.lessonId,
          sentenceIndex: s.i,
        }),
      ),
    );
    ctx.telemetry.emit({
      name: 'lesson.script_ready',
      properties: { lessonId: job.lessonId, totalSentences: sentences.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.lessons.update(job.lessonId, (l) => ({
      ...l,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    }));
    ctx.telemetry.emit({
      name: 'lesson.failed',
      properties: { lessonId: job.lessonId, stage: 'script_gen', error: message },
    });
    throw err;
  }
}

app.storageQueue('scriptGenWorker', {
  queueName: 'script-gen',
  connection: 'AzureWebJobsStorage',
  handler: async (rawMessage) => {
    const job = decodeJob(rawMessage);
    await scriptGenWorker(job);
  },
});

function decodeJob(raw: unknown): ScriptGenJob {
  if (typeof raw === 'object' && raw !== null) return raw as ScriptGenJob;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ScriptGenJob;
    } catch {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded) as ScriptGenJob;
    }
  }
  throw new Error('unrecognized queue message shape');
}
