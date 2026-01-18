import { appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

type BunServer = ReturnType<typeof Bun.serve>;

const LOG_FILE = join(homedir(), ".claude", "otlp-debug.log");

function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] ${message}\n${JSON.stringify(data, null, 2)}\n\n`
    : `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
}

export interface ToolCall {
  timestamp: Date;
  toolName: string;
  status: "started" | "completed" | "error";
  duration?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface OTLPData {
  lastToolCall: ToolCall | null;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  isThinking: boolean;
  currentTool: string | null;
  sessionId: string | null;
}

type OTLPListener = (data: OTLPData) => void;

class OTLPReceiverService {
  private server: BunServer | null = null;
  private port = 4319;
  private listeners: Set<OTLPListener> = new Set();
  private activityTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTime = 0;

  private data: OTLPData = {
    lastToolCall: null,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    isThinking: false,
    currentTool: null,
    sessionId: null,
  };

  // Auto-reset nach 3 Sekunden Inaktivität
  private resetActivityTimeout() {
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout);
    }
    this.lastActivityTime = Date.now();
    this.activityTimeout = setTimeout(() => {
      // Nur zurücksetzen wenn wirklich keine Aktivität war
      if (Date.now() - this.lastActivityTime >= 2900) {
        this.data.isThinking = false;
        this.data.currentTool = null;
        this.notify();
      }
    }, 3000);
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number {
    return this.port;
  }

  getData(): OTLPData {
    return { ...this.data };
  }

  subscribe(listener: OTLPListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.getData());
    }
  }

  start(): boolean {
    if (this.server) return true;

    try {
      log(`OTLP Receiver starting on port ${this.port}`);
      this.server = Bun.serve({
        port: this.port,
        fetch: async (req) => {
          const url = new URL(req.url);

          // CORS headers for local requests
          const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          };

          if (req.method === "OPTIONS") {
            return new Response(null, { headers });
          }

          if (req.method !== "POST") {
            return new Response("Method not allowed", { status: 405, headers });
          }

          try {
            const contentType = req.headers.get("content-type") || "";
            let body: unknown;

            if (contentType.includes("application/json")) {
              body = await req.json();
              log(`${req.method} ${url.pathname} (JSON)`, body);
            } else if (contentType.includes("protobuf")) {
              // For protobuf, log raw bytes info
              const rawBody = await req.arrayBuffer();
              log(`${req.method} ${url.pathname} (protobuf, ${rawBody.byteLength} bytes)`);
              return new Response(JSON.stringify({ partialSuccess: {} }), {
                headers: { ...headers, "Content-Type": "application/json" },
              });
            } else {
              body = await req.json().catch(() => ({}));
              log(`${req.method} ${url.pathname} (unknown: ${contentType})`, body);
            }

            // Process based on endpoint
            if (url.pathname === "/v1/logs") {
              this.processLogs(body);
            } else if (url.pathname === "/v1/metrics") {
              this.processMetrics(body);
            } else if (url.pathname === "/v1/traces") {
              this.processTraces(body);
            }

            return new Response(JSON.stringify({ partialSuccess: {} }), {
              headers: { ...headers, "Content-Type": "application/json" },
            });
          } catch {
            return new Response(JSON.stringify({ partialSuccess: {} }), {
              headers: { ...headers, "Content-Type": "application/json" },
            });
          }
        },
      });

      return true;
    } catch {
      this.server = null;
      return false;
    }
  }

  stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  private processLogs(body: unknown) {
    if (!body || typeof body !== "object") return;

    const data = body as Record<string, unknown>;
    const resourceLogs = data.resourceLogs as Array<Record<string, unknown>> | undefined;

    if (!resourceLogs) return;

    for (const resourceLog of resourceLogs) {
      const scopeLogs = resourceLog.scopeLogs as Array<Record<string, unknown>> | undefined;
      if (!scopeLogs) continue;

      for (const scopeLog of scopeLogs) {
        const logRecords = scopeLog.logRecords as Array<Record<string, unknown>> | undefined;
        if (!logRecords) continue;

        for (const log of logRecords) {
          this.processLogRecord(log);
        }
      }
    }

    this.notify();
  }

  private processLogRecord(log: Record<string, unknown>) {
    const attributes = log.attributes as Array<Record<string, unknown>> | undefined;

    // Extract event name, tool name, and session ID from attributes
    let eventName: string | null = null;
    let toolName: string | null = null;
    let sessionId: string | null = null;

    if (attributes) {
      for (const attr of attributes) {
        const key = attr.key as string;
        const value = attr.value as Record<string, unknown> | undefined;

        if (key === "event.name" && value?.stringValue) {
          eventName = value.stringValue as string;
        }
        if (key === "tool_name" && value?.stringValue) {
          toolName = value.stringValue as string;
        }
        if (key === "session.id" && value?.stringValue) {
          sessionId = value.stringValue as string;
        }
      }
    }

    // Update session ID if found
    if (sessionId && sessionId !== this.data.sessionId) {
      this.data.sessionId = sessionId;
    }

    // Handle different event types based on actual Claude Code OTLP events
    if (eventName === "api_request") {
      // API request = Claude is thinking/generating
      this.data.isThinking = true;
      this.data.currentTool = null;
      this.resetActivityTimeout();
    } else if (eventName === "tool_decision" && toolName) {
      // Tool decision = Claude decided to use a tool
      this.data.currentTool = toolName;
      this.data.isThinking = false;
      this.data.lastToolCall = {
        timestamp: new Date(),
        toolName,
        status: "started",
      };
      this.resetActivityTimeout();
    } else if (eventName === "tool_result") {
      // Tool result = tool finished, Claude might think again or be done
      if (this.data.lastToolCall) {
        this.data.lastToolCall.status = "completed";
        this.data.lastToolCall.duration = Date.now() - this.data.lastToolCall.timestamp.getTime();
      }
      this.data.currentTool = null;
      this.data.isThinking = false; // Wait for next api_request
      this.resetActivityTimeout();
    } else if (eventName === "user_prompt") {
      // User sent a new prompt - Claude will start thinking
      this.data.isThinking = true;
      this.data.currentTool = null;
      this.resetActivityTimeout();
    }
  }

  private processMetrics(body: unknown) {
    if (!body || typeof body !== "object") return;

    const data = body as Record<string, unknown>;
    const resourceMetrics = data.resourceMetrics as Array<Record<string, unknown>> | undefined;

    if (!resourceMetrics) return;

    for (const resourceMetric of resourceMetrics) {
      const scopeMetrics = resourceMetric.scopeMetrics as Array<Record<string, unknown>> | undefined;
      if (!scopeMetrics) continue;

      for (const scopeMetric of scopeMetrics) {
        const metrics = scopeMetric.metrics as Array<Record<string, unknown>> | undefined;
        if (!metrics) continue;

        for (const metric of metrics) {
          this.processMetric(metric);
        }
      }
    }

    this.notify();
  }

  private processMetric(metric: Record<string, unknown>) {
    const name = metric.name as string;
    const sum = metric.sum as Record<string, unknown> | undefined;
    const gauge = metric.gauge as Record<string, unknown> | undefined;

    const dataPoints = (sum?.dataPoints || gauge?.dataPoints) as Array<Record<string, unknown>> | undefined;
    if (!dataPoints || dataPoints.length === 0) return;

    const lastPoint = dataPoints[dataPoints.length - 1];
    const value = (lastPoint?.asInt || lastPoint?.asDouble || 0) as number;

    if (name === "claude_code.tokens.input" || name.includes("input_tokens")) {
      this.data.inputTokens = value;
    } else if (name === "claude_code.tokens.output" || name.includes("output_tokens")) {
      this.data.outputTokens = value;
    } else if (name === "claude_code.cost" || name.includes("cost")) {
      this.data.totalCost = value;
    }
  }

  private processTraces(body: unknown) {
    // Traces are less useful for our purposes, but we acknowledge them
    if (!body || typeof body !== "object") return;
    // Could extract span information here if needed
  }

  reset() {
    this.data = {
      lastToolCall: null,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      isThinking: false,
      currentTool: null,
      sessionId: null,
    };
    this.notify();
  }
}

// Singleton instance
export const otlpReceiver = new OTLPReceiverService();
