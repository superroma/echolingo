import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isEchoId } from '../_shared/index.js';
import { getContext } from '../context.js';
import { concatMp3 } from '../lib/concat-mp3.js';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { Config } from '../config.js';

const FULL_BLOB_NAME = 'full.mp3';

export async function echoDownloadHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!isEchoId(id)) return json(400, { error: 'invalid id' });
  const ctx = getContext();
  const echo = await ctx.echoes.get(id);
  if (!echo) return json(404, { error: 'echo not found' });
  if (echo.status !== 'ready') {
    return json(409, { error: `echo is ${echo.status}, not ready` });
  }

  if (echo.fullMp3Url) {
    return json(200, { url: echo.fullMp3Url });
  }

  const order = echo.params.bilingualOrder;
  const mode = echo.params.mode;
  const parts: Array<Buffer | null> = [];
  for (const sentence of echo.sentences) {
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
  await ctx.echoes.update(id, (e) => ({
    ...e,
    fullMp3Url: fullUrl,
    updatedAt: new Date().toISOString(),
  }));
  ctx.telemetry.emit({
    name: 'echo.downloaded',
    properties: { echoId: id, bytes: fullMp3.length },
  });
  return json(200, { url: fullUrl });
}

async function uploadFullBlob(
  config: Config,
  echoId: string,
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
  const blob = containerClient.getBlockBlobClient(`${echoId}/${FULL_BLOB_NAME}`);
  await blob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
  });
  return `${service.url.replace(/\/$/, '')}/${container}/${echoId}/${FULL_BLOB_NAME}`;
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('echoDownload', {
  route: 'echo/{id}/download',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: echoDownloadHandler,
});
