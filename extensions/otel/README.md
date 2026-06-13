# OpenTelemetry Extension

Exports Pi usage telemetry to an OpenTelemetry collector via OTLP/HTTP.

## What It Emits

- Session lifecycle logs and a session span
- Agent and turn spans
- Tool spans with tool name, duration, result size, and error status
- Provider request spans with payload size and HTTP status
- Model and thinking-level change logs
- Context token usage when Pi exposes it

By default, prompt text, tool output, and provider payload bodies are not
exported. Only counts, sizes, names, timings, status codes, and selected
file/search metadata are sent. Bash command text is exported only when
`PI_OTEL_EXPORT_CONTENT=true`.

## Configuration

Set environment variables before starting Pi:

```sh
export PI_OTEL_ENDPOINT=http://localhost:4318
export PI_OTEL_SERVICE_NAME=pi-harness
pi
```

Supported variables:

| Variable | Default | Description |
|---|---|---|
| `PI_OTEL_ENABLED` | `true` | Set to `false` to disable exporting |
| `PI_OTEL_ENDPOINT` | `OTEL_EXPORTER_OTLP_ENDPOINT` or `http://localhost:4318` | OTLP/HTTP base URL |
| `PI_OTEL_TRACES_ENDPOINT` | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Explicit traces endpoint |
| `PI_OTEL_LOGS_ENDPOINT` | `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | Explicit logs endpoint |
| `PI_OTEL_HEADERS` | `OTEL_EXPORTER_OTLP_HEADERS` | Comma-separated `key=value` headers |
| `PI_OTEL_SERVICE_NAME` | `OTEL_SERVICE_NAME` or `pi-harness` | OpenTelemetry service name |
| `PI_OTEL_SERVICE_VERSION` | `1.0.0` | OpenTelemetry service version |
| `PI_OTEL_EXPORT_CONTENT` | `false` | Export prompt/input text when `true` |
| `PI_OTEL_DEBUG` | `false` | Print export failures to stderr |
| `PI_OTEL_BATCH_SIZE` | `32` | Max records per OTLP request |
| `PI_OTEL_FLUSH_INTERVAL_MS` | `5000` | Max time before queued records are flushed |
| `PI_OTEL_TIMEOUT_MS` | `3000` | Per-request export timeout |
| `PI_OTEL_RETRY_COUNT` | `2` | Retry count for timeout, network, 408, 429, and 5xx failures |
| `PI_OTEL_MAX_QUEUE_SIZE` | `1000` | Max queued telemetry records before oldest records are dropped |

## Local Collector Example

Run an OpenTelemetry collector that receives OTLP/HTTP on `4318`, then start
Pi with:

```sh
PI_OTEL_ENDPOINT=http://localhost:4318 pi
```

If you use a hosted backend, set `PI_OTEL_ENDPOINT` to its OTLP/HTTP endpoint
and pass authentication via `PI_OTEL_HEADERS`.

## Command

Use `/otel-flush` to flush pending telemetry exports manually.

## Reliability Behavior

- Telemetry is batched to reduce collector overhead.
- Failed exports are retried with a short linear backoff.
- Non-retryable 4xx responses are dropped immediately.
- A bounded in-memory queue prevents telemetry failures from blocking Pi.
- Session shutdown and `/otel-flush` flush queued records before returning.
