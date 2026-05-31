import { describe, it, expect } from 'vitest';
import { createTelemetry, type TelemetryEvent } from '../src/lib/telemetry.js';

describe('createTelemetry', () => {
  it('returns a no-op emitter when no connection string is provided', () => {
    const t = createTelemetry({ connectionString: undefined });
    expect(() =>
      t.emit({ name: 'echo.created', properties: { echoId: 'abc' } }),
    ).not.toThrow();
  });

  it('records events when given a recording sink', () => {
    const recorded: TelemetryEvent[] = [];
    const t = createTelemetry({
      connectionString: 'InstrumentationKey=test',
      sink: (e) => recorded.push(e),
    });
    t.emit({ name: 'echo.created', properties: { echoId: 'abc', engine: 'openai' } });
    t.emit({ name: 'echo.failed', properties: { echoId: 'abc', error: 'boom' } });
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toEqual({
      name: 'echo.created',
      properties: { echoId: 'abc', engine: 'openai' },
    });
  });
});
