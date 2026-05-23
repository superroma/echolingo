import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getContext } from '../context.js';
import { concatMp3 } from '../lib/concat-mp3.js';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { Config } from '../config.js';

const FULL_BLOB_NAME = 'full.mp3';

export async function lessonDownloadHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json(400, { error: 'missing id' });
  const ctx = getContext();
  const lesson = await ctx.lessons.get(id);
  if (!lesson) return json(404, { error: 'lesson not found' });
  if (lesson.status !== 'ready') {
    return json(409, { error: `lesson is ${lesson.status}, not ready` });
  }

  if (lesson.fullMp3Url) {
    return json(200, { url: lesson.fullMp3Url });
  }

  const order = lesson.params.bilingualOrder;
  const mode = lesson.params.mode;
  const parts: Array<Buffer | null> = [];
  for (const sentence of lesson.sentences) {
    const gr = await ctx.audio.fetch(id, sentence.i, 'gr');
    const native =
      mode === 'bilingual' ? await ctx.audio.fetch(id, sentence.i, 'native') : null;
    if (mode === 'target_only') {
      parts.push(gr);
    } else if (order === 'target_first') {
      parts.push(gr, native);
    } else {
      parts.push(native, gr);
    }
  }

  const fullMp3 = concatMp3(parts);
  const fullUrl = await uploadFullBlob(
    ctx.config,
    id,
    fullMp3,
  );
  await ctx.lessons.update(id, (l) => ({
    ...l,
    fullMp3Url: fullUrl,
    updatedAt: new Date().toISOString(),
  }));
  ctx.telemetry.emit({
    name: 'lesson.downloaded',
    properties: { lessonId: id, bytes: fullMp3.length },
  });
  return json(200, { url: fullUrl });
}

async function uploadFullBlob(
  config: Config,
  lessonId: string,
  data: Buffer,
): Promise<string> {
  const container = config.audioContainer;
  let service: BlobServiceClient;
  if (config.blobEndpoint) {
    service = new BlobServiceClient(config.blobEndpoint, new DefaultAzureCredential());
  } else if (config.storageConnectionString) {
    service = BlobServiceClient.fromConnectionString(config.storageConnectionString);
  } else {
    throw new Error('uploadFullBlob requires blobEndpoint or storageConnectionString');
  }
  const containerClient = service.getContainerClient(container);
  await containerClient.createIfNotExists();
  const blob = containerClient.getBlockBlobClient(`${lessonId}/${FULL_BLOB_NAME}`);
  await blob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
  });
  return `${service.url.replace(/\/$/, '')}/${container}/${lessonId}/${FULL_BLOB_NAME}`;
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonDownload', {
  route: 'lesson/{id}/download',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: lessonDownloadHandler,
});
