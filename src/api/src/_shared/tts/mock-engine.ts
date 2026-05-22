import { createHash } from 'node:crypto';
import type {
  TtsEngine,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
} from './interface.js';

const CHARS_PER_SECOND = 14;

export class MockTtsEngine implements TtsEngine {
  readonly name = 'mock' as const;

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const seed = createHash('sha256')
      .update(`${req.lang}::${req.voice ?? ''}::${req.text}`)
      .digest();
    const mp3 = Buffer.concat([Buffer.from('MOCKMP3'), seed]);
    const durationSec = Math.max(0.3, req.text.length / CHARS_PER_SECOND);
    return { mp3, durationSec };
  }
}
