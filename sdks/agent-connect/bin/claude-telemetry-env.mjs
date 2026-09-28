export function claudeTelemetryEnvironment(baseEnvironment, localReceiver) {
  const environment = { ...baseEnvironment };
  delete environment.NIU_COLLECTOR_KEY;
  for (const key of Object.keys(environment)) {
    if (key.startsWith('OTEL_EXPORTER_OTLP_')) delete environment[key];
  }
  Object.assign(environment, {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'none',
    OTEL_TRACES_EXPORTER: 'none',
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: localReceiver.url,
    OTEL_EXPORTER_OTLP_LOGS_HEADERS: localReceiver.authorization.replace(/^Bearer /, 'Authorization=Bearer '),
    OTEL_LOG_USER_PROMPTS: '0',
    OTEL_LOG_ASSISTANT_RESPONSES: '0',
    OTEL_LOG_TOOL_DETAILS: '0',
    OTEL_LOG_TOOL_CONTENT: '0',
    OTEL_LOG_RAW_API_BODIES: '0',
  });
  return environment;
}
