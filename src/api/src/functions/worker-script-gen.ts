import { app } from '@azure/functions';
import { buildPrompt, parseScript, type ScriptGenJob } from '../_shared/index.js';
import { getContext } from '../context.js';

export async function scriptGenWorker(job: ScriptGenJob): Promise<void> {
  const ctx = getContext();
  const echo = await ctx.echoes.get(job.echoId);
  if (!echo) throw new Error(`Echo ${job.echoId} not found`);
  if (echo.status !== 'generating_script') return;

  try {
    const prompt = buildPrompt(echo.params);
    const raw = await ctx.llm.generateScript(prompt);
    const sentences = parseScript(raw);
    if (sentences.length === 0) {
      throw new Error('empty script: parseScript returned no sentences');
    }

    await ctx.echoes.update(job.echoId, (e) => ({
      ...e,
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
          echoId: job.echoId,
          sentenceIndex: s.i,
        }),
      ),
    );
    ctx.telemetry.emit({
      name: 'echo.script_ready',
      properties: { echoId: job.echoId, totalSentences: sentences.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.echoes.update(job.echoId, (e) => ({
      ...e,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    }));
    ctx.telemetry.emit({
      name: 'echo.failed',
      properties: { echoId: job.echoId, stage: 'script_gen', error: message },
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
