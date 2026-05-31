import appInsights from 'applicationinsights';

export interface TelemetryEvent {
  name:
    | 'echo.created'
    | 'echo.cache_hit'
    | 'echo.rate_limited'
    | 'echo.script_ready'
    | 'echo.audio_ready'
    | 'echo.failed'
    | 'echo.downloaded';
  properties?: Record<string, string | number | undefined>;
}

export interface TelemetryOptions {
  connectionString: string | undefined;
  sink?: (event: TelemetryEvent) => void;
}

export interface Telemetry {
  emit(event: TelemetryEvent): void;
}

let initialized = false;

export function createTelemetry(opts: TelemetryOptions): Telemetry {
  if (opts.sink) {
    return { emit: (e) => opts.sink!(e) };
  }
  if (!opts.connectionString) {
    return { emit: () => {} };
  }
  if (!initialized) {
    appInsights
      .setup(opts.connectionString)
      .setSendLiveMetrics(false)
      .start();
    initialized = true;
  }
  return {
    emit: (event) => {
      appInsights.defaultClient.trackEvent({
        name: event.name,
        properties: event.properties as Record<string, string>,
      });
    },
  };
}
