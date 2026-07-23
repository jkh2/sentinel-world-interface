/** Wire protocols supported by the public-edition cognitive bridge. */
export type GenericLLMProtocol = 'openai-compatible' | 'anthropic';

/**
 * Provider configuration lives in Electron's main process. API keys must never
 * be sent to the renderer or included in AgentOutputEvent payloads.
 *
 * OpenAI, xAI, Groq, OpenRouter, and most local servers use the
 * `openai-compatible` protocol. Anthropic uses its Messages API protocol.
 */
export interface GenericLLMProviderConfig {
  protocol: GenericLLMProtocol;
  /** Provider API root, e.g. https://api.openai.com/v1. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Extra provider-required headers. Kept main-process only. */
  headers?: Readonly<Record<string, string>>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/** Validate configuration before any credential can leave the process. */
export function validateProviderConfig(
  config: GenericLLMProviderConfig,
): GenericLLMProviderConfig {
  const url = new URL(config.baseUrl);
  const secureRemote = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (!secureRemote && !localHttp) {
    throw new Error('Provider URL must use HTTPS, except for a loopback local model');
  }
  if (!config.model.trim()) throw new Error('Provider model is required');

  return {
    ...config,
    baseUrl: url.toString().replace(/\/$/, ''),
    model: config.model.trim(),
    maxTokens: Math.max(1, Math.min(config.maxTokens ?? 1024, 8192)),
    temperature:
      config.temperature === undefined
        ? undefined
        : Math.max(0, Math.min(config.temperature, 2)),
    timeoutMs: Math.max(1_000, Math.min(config.timeoutMs ?? 60_000, 300_000)),
  };
}
