/**
 * OpenTelemetry Extension
 *
 * Exports Pi usage telemetry to an OTLP/HTTP collector without adding runtime
 * dependencies. Payload content is intentionally conservative: prompts, tool
 * outputs, and provider payloads are not exported unless explicitly enabled.
 */

import { randomBytes } from "node:crypto";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";

type AttributeValue = string | number | boolean | undefined | null;

interface SpanRecord {
	name: string;
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	startTimeUnixNano: string;
	attributes: Record<string, AttributeValue>;
}

interface LogRecord {
	timeUnixNano: string;
	severityText: "INFO" | "WARN" | "ERROR";
	body: string;
	attributes: Record<string, AttributeValue>;
	traceId?: string;
	spanId?: string;
}

interface TelemetryConfig {
	enabled: boolean;
	endpoint: string;
	tracesEndpoint?: string;
	logsEndpoint?: string;
	headers: Record<string, string>;
	serviceName: string;
	serviceVersion: string;
	exportContent: boolean;
	debug: boolean;
}

const SCOPE_NAME = "pi-harness.otel";
const SCOPE_VERSION = "1.0.0";
const DEFAULT_ENDPOINT = "http://localhost:4318";

function nowNanos(): string {
	return BigInt(Date.now()) * 1_000_000n + "";
}

function randomHex(bytes: number): string {
	return Array.from(randomBytes(bytes))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (value === undefined) return defaultValue;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseHeaders(value: string | undefined): Record<string, string> {
	if (!value) return {};

	return Object.fromEntries(
		value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const index = part.indexOf("=");
				if (index === -1) return [part, ""];
				return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
			}),
	);
}

function loadConfig(): TelemetryConfig {
	const endpoint = process.env.PI_OTEL_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? DEFAULT_ENDPOINT;
	const headers = {
		...parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
		...parseHeaders(process.env.PI_OTEL_HEADERS),
	};

	return {
		enabled: parseBoolean(process.env.PI_OTEL_ENABLED, true),
		endpoint: endpoint.replace(/\/$/, ""),
		tracesEndpoint: process.env.PI_OTEL_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
		logsEndpoint: process.env.PI_OTEL_LOGS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
		headers,
		serviceName: process.env.PI_OTEL_SERVICE_NAME ?? process.env.OTEL_SERVICE_NAME ?? "pi-harness",
		serviceVersion: process.env.PI_OTEL_SERVICE_VERSION ?? "1.0.0",
		exportContent: parseBoolean(process.env.PI_OTEL_EXPORT_CONTENT, false),
		debug: parseBoolean(process.env.PI_OTEL_DEBUG, false),
	};
}

function attributeValue(value: AttributeValue) {
	if (value === undefined || value === null) return { stringValue: "" };
	if (typeof value === "boolean") return { boolValue: value };
	if (typeof value === "number") return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
	return { stringValue: value };
}

function attributes(values: Record<string, AttributeValue>) {
	return Object.entries(values)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => ({ key, value: attributeValue(value) }));
}

function resourceAttributes(config: TelemetryConfig, ctx?: ExtensionContext) {
	return attributes({
		"service.name": config.serviceName,
		"service.version": config.serviceVersion,
		"telemetry.sdk.language": "typescript",
		"telemetry.sdk.name": "pi-harness",
		"process.runtime.name": "nodejs",
		"process.runtime.version": process.version,
		"pi.cwd": ctx?.cwd ?? process.cwd(),
	});
}

function endpointUrl(config: TelemetryConfig, signal: "traces" | "logs"): string {
	const signalEndpoint = signal === "traces" ? config.tracesEndpoint : config.logsEndpoint;
	if (signalEndpoint) return signalEndpoint.replace(/\/$/, "");

	const base = config.endpoint;
	if (base.endsWith(`/v1/${signal}`)) return base;
	if (base.endsWith("/v1")) return `${base}/${signal}`;
	return `${base}/v1/${signal}`;
}

function safeJsonSize(value: unknown): number {
	try {
		return JSON.stringify(value)?.length ?? 0;
	} catch {
		return 0;
	}
}

function inputShape(event: ToolCallEvent, exportContent: boolean): Record<string, AttributeValue> {
	const input = event.input as Record<string, unknown>;
	const result: Record<string, AttributeValue> = {
		"tool.name": event.toolName,
		"tool.call_id": event.toolCallId,
		"tool.input.size": safeJsonSize(input),
	};

	for (const key of ["file", "path", "pattern", "command"]) {
		const value = input[key];
		if (typeof value === "string") {
			if (key === "command" && !exportContent) continue;
			result[`tool.input.${key}`] = key === "command" ? value.slice(0, 160) : value;
		}
	}

	return result;
}

class OtlpExporter {
	private pending: Promise<void>[] = [];

	constructor(private readonly config: TelemetryConfig) {}

	exportSpan(span: SpanRecord, endTimeUnixNano = nowNanos(), statusCode: "OK" | "ERROR" = "OK"): void {
		if (!this.config.enabled) return;

		const body = {
			resourceSpans: [
				{
					resource: { attributes: resourceAttributes(this.config) },
					scopeSpans: [
						{
							scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
							spans: [
								{
									traceId: span.traceId,
									spanId: span.spanId,
									parentSpanId: span.parentSpanId,
									name: span.name,
									kind: 1,
									startTimeUnixNano: span.startTimeUnixNano,
									endTimeUnixNano,
									attributes: attributes(span.attributes),
									status: { code: statusCode === "OK" ? 1 : 2 },
								},
							],
						},
					],
				},
			],
		};

		this.send("traces", body);
	}

	exportLog(record: LogRecord): void {
		if (!this.config.enabled) return;

		const body = {
			resourceLogs: [
				{
					resource: { attributes: resourceAttributes(this.config) },
					scopeLogs: [
						{
							scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
							logRecords: [
								{
									timeUnixNano: record.timeUnixNano,
									severityText: record.severityText,
									body: { stringValue: record.body },
									attributes: attributes(record.attributes),
									traceId: record.traceId,
									spanId: record.spanId,
								},
							],
						},
					],
				},
			],
		};

		this.send("logs", body);
	}

	async flush(): Promise<void> {
		await Promise.allSettled(this.pending.splice(0));
	}

	private send(signal: "traces" | "logs", body: unknown): void {
		const request = fetch(endpointUrl(this.config, signal), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify(body),
		})
			.then(async (response) => {
				if (!response.ok && this.config.debug) {
					console.error(`[otel] export ${signal} failed: ${response.status} ${await response.text()}`);
				}
			})
			.catch((error) => {
				if (this.config.debug) {
					console.error(`[otel] export ${signal} failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			});

		this.pending.push(request);
	}
}

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	const exporter = new OtlpExporter(config);
	const sessionTraceId = randomHex(16);
	const sessionSpanId = randomHex(8);
	const toolSpans = new Map<string, SpanRecord>();
	const providerSpans: SpanRecord[] = [];
	let sessionSpan: SpanRecord | undefined;
	let currentTurnSpan: SpanRecord | undefined;
	let currentAgentSpan: SpanRecord | undefined;
	let sessionId = "unknown";

	function baseAttributes(ctx?: ExtensionContext): Record<string, AttributeValue> {
		const usage = ctx?.getContextUsage();
		const model = ctx?.model;
		return {
			"session.id": sessionId,
			"pi.session_name": pi.getSessionName(),
			"pi.model.provider": model?.provider,
			"pi.model.id": model?.id,
			"pi.context.tokens": usage?.tokens ?? undefined,
			"pi.context.window": usage?.contextWindow,
			"pi.context.percent": usage?.percent ?? undefined,
		};
	}

	function startSpan(name: string, attrs: Record<string, AttributeValue> = {}, parentSpanId = sessionSpanId): SpanRecord {
		return {
			name,
			traceId: sessionTraceId,
			spanId: randomHex(8),
			parentSpanId,
			startTimeUnixNano: nowNanos(),
			attributes: {
				...attrs,
			},
		};
	}

	function log(body: string, attrs: Record<string, AttributeValue> = {}, severityText: LogRecord["severityText"] = "INFO"): void {
		exporter.exportLog({
			timeUnixNano: nowNanos(),
			severityText,
			body,
			attributes: {
				"session.id": sessionId,
				...attrs,
			},
			traceId: sessionTraceId,
			spanId: currentTurnSpan?.spanId ?? currentAgentSpan?.spanId ?? sessionSpanId,
		});
	}

	pi.registerCommand("otel-flush", {
		description: "Flush pending OpenTelemetry exports",
		handler: async (_args, ctx) => {
			await exporter.flush();
			ctx.ui.notify("OpenTelemetry exports flushed", "info");
		},
	});

	pi.on("session_start", async (event, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		sessionSpan = {
			name: "pi.session",
			traceId: sessionTraceId,
			spanId: sessionSpanId,
			startTimeUnixNano: nowNanos(),
			attributes: {
				...baseAttributes(ctx),
				"session.start.reason": event.reason,
				"session.file": ctx.sessionManager.getSessionFile(),
			},
		};
		log("session_start", { "session.start.reason": event.reason });
	});

	pi.on("model_select", async (event, ctx) => {
		log("model_select", {
			...baseAttributes(ctx),
			"model.source": event.source,
			"model.provider": event.model.provider,
			"model.id": event.model.id,
			"model.previous_provider": event.previousModel?.provider,
			"model.previous_id": event.previousModel?.id,
		});
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		log("thinking_level_select", {
			...baseAttributes(ctx),
			"thinking.level": event.level,
			"thinking.previous_level": event.previousLevel,
		});
	});

	pi.on("input", async (event) => {
		log("input", {
			"input.source": event.source,
			"input.length": event.text.length,
			"input.images": event.images?.length ?? 0,
			"input.text": config.exportContent ? event.text : undefined,
		});
	});

	pi.on("before_agent_start", async (event, ctx) => {
		log("before_agent_start", {
			...baseAttributes(ctx),
			"prompt.length": event.prompt.length,
			"prompt.images": event.images?.length ?? 0,
			"system_prompt.length": event.systemPrompt.length,
			"prompt.text": config.exportContent ? event.prompt : undefined,
		});
	});

	pi.on("agent_start", async (_event, ctx) => {
		currentAgentSpan = startSpan("pi.agent", baseAttributes(ctx));
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!currentAgentSpan) return;
		currentAgentSpan.attributes = {
			...currentAgentSpan.attributes,
			...baseAttributes(ctx),
		};
		exporter.exportSpan(currentAgentSpan);
		currentAgentSpan = undefined;
	});

	pi.on("turn_start", async (event, ctx) => {
		currentTurnSpan = startSpan("pi.turn", {
			...baseAttributes(ctx),
			"turn.index": event.turnIndex,
			"turn.timestamp": event.timestamp,
		});
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!currentTurnSpan) return;
		currentTurnSpan.attributes = {
			...currentTurnSpan.attributes,
			...baseAttributes(ctx),
			"turn.index": event.turnIndex,
			"turn.tool_results": event.toolResults.length,
		};
		exporter.exportSpan(currentTurnSpan);
		currentTurnSpan = undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		const parentSpanId = currentTurnSpan?.spanId ?? currentAgentSpan?.spanId ?? sessionSpanId;
		toolSpans.set(
			event.toolCallId,
			startSpan(
				`pi.tool.${event.toolName}`,
				{
					...baseAttributes(ctx),
					...inputShape(event, config.exportContent),
				},
				parentSpanId,
			),
		);
	});

	pi.on("tool_result", async (event, ctx) => {
		const span = toolSpans.get(event.toolCallId);
		if (!span) return;
		span.attributes = {
			...span.attributes,
			...baseAttributes(ctx),
			"tool.error": event.isError,
			"tool.result.items": event.content.length,
			"tool.result.size": safeJsonSize(event.content),
		};
		exporter.exportSpan(span, nowNanos(), event.isError ? "ERROR" : "OK");
		toolSpans.delete(event.toolCallId);
	});

	pi.on("before_provider_request", async (event) => {
		providerSpans.push(
			startSpan("pi.provider.request", {
				"provider.payload.size": safeJsonSize(event.payload),
			}),
		);
	});

	pi.on("after_provider_response", async (event, ctx) => {
		const span = providerSpans.shift() ?? startSpan("pi.provider.request");
		span.attributes = {
			...span.attributes,
			...baseAttributes(ctx),
			"http.response.status_code": event.status,
		};
		exporter.exportSpan(span, nowNanos(), event.status >= 400 ? "ERROR" : "OK");
	});

	pi.on("session_before_compact", async (_event, ctx) => {
		log("session_before_compact", baseAttributes(ctx));
	});

	pi.on("session_compact", async (_event, ctx) => {
		log("session_compact", baseAttributes(ctx));
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		log("session_shutdown", baseAttributes(ctx));
		if (sessionSpan) {
			sessionSpan.attributes = {
				...sessionSpan.attributes,
				...baseAttributes(ctx),
			};
			exporter.exportSpan(sessionSpan);
		}
		await exporter.flush();
	});
}
