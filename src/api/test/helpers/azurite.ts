import { BlobServiceClient } from '@azure/storage-blob';

export const AZURITE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;' +
  'QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;' +
  'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

export async function isAzuriteReachable(timeoutMs = 1000): Promise<boolean> {
  const client = BlobServiceClient.fromConnectionString(AZURITE_CONNECTION_STRING);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await client.getProperties({ abortSignal: ctrl.signal });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
