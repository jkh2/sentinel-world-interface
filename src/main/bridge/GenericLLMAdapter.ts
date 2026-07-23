import { randomUUID } from 'node:crypto';
import { BaseAgentAdapter } from './AgentSessionAdapter';
import {
  validateProviderConfig,
  type GenericLLMProviderConfig,
} from './genericLLMConfig';
import {
  COMPANION_SYSTEM_PROMPT,
  serializeObservation,
  WORLD_ACTION_INPUT_SCHEMA,
  WORLD_ACTION_TOOL_NAME,
  type WorldObservation,
  type WorldObservationProvider,
} from './worldCognitionContract';
import { parseWorldAction, type WorldAction } from '../../shared/worldActions';
import type { AgentBackendKind, SessionOptions } from '../../shared/types';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

interface ModelTurn {
  text: string;
  actionInputs: unknown[];
}

export interface GenericLLMAdapterDependencies {
  fetch?: typeof globalThis.fetch;
  observation?: WorldObservationProvider;
}

/**
 * Public-edition cognitive bridge. It exposes one capability to the model:
 * validated world actions. It has no CLI, filesystem, shell, or MCP surface.
 */
export class GenericLLMAdapter extends BaseAgentAdapter {
  readonly kind: AgentBackendKind = 'generic-llm';

  private readonly config: GenericLLMProviderConfig;
  private readonly fetchImpl: typeof globalThis.fetch;
  private observationProvider: WorldObservationProvider;
  private observation: WorldObservation | null = null;
  private history: ConversationMessage[] = [];
  private controller: AbortController | null = null;
  private sessionId: string | null = null;
  private activeModel: string;

  constructor(
    config: GenericLLMProviderConfig,
    dependencies: GenericLLMAdapterDependencies = {},
  ) {
    super();
    this.config = validateProviderConfig(config);
    this.activeModel = this.config.model;
    this.fetchImpl = dependencies.fetch ?? globalThis.fetch;
    this.observationProvider = dependencies.observation ?? (() => this.observation);
  }

  setObservation(observation: WorldObservation | null): void {
    this.observation = observation;
  }

  setObservationProvider(provider: WorldObservationProvider): void {
    this.observationProvider = provider;
  }

  async startSession(options: SessionOptions): Promise<void> {
    if (this.sessionId) await this.stopSession();
    this.setStatus('starting');
    this.sessionId = randomUUID();
    this.activeModel = options.model?.trim() || this.config.model;
    this.history = [];
    this.capability = {
      cli: this.kind,
      version: 'provider-api-v1',
      interactivePty: false,
      structuredOutput: true,
      sessionResume: false,
      mcpAvailable: false,
      permissionEvents: 'none',
    };
    this.emit({
      kind: 'session-started',
      sessionId: this.sessionId,
      // Kept for compatibility with the existing event contract. This adapter
      // never reads or writes the supplied directory.
      cwd: options.cwd,
      model: this.activeModel,
      capability: this.capability,
    });
    this.setStatus('ready');
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.sessionId) {
      this.emit({ kind: 'error', message: 'no live generic LLM session' });
      return;
    }
    if (this.controller) {
      this.emit({ kind: 'error', message: 'the companion is already responding' });
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) return;
    this.history.push({ role: 'user', content: trimmed });
    this.trimHistory();
    this.controller = new AbortController();
    const timeout = setTimeout(
      () => this.controller?.abort(new Error('provider request timed out')),
      this.config.timeoutMs,
    );
    this.setStatus('thinking');

    try {
      const observation = this.observationProvider();
      const turn = this.config.protocol === 'anthropic'
        ? await this.callAnthropic(observation, this.controller.signal)
        : await this.callOpenAICompatible(observation, this.controller.signal);

      const actions = this.validateActions(turn.actionInputs);
      if (turn.text) {
        this.setStatus('streaming');
        this.emit({ kind: 'assistant-delta', text: turn.text });
        this.emit({ kind: 'assistant-message', text: turn.text });
        this.history.push({ role: 'assistant', content: turn.text });
      } else {
        this.history.push({ role: 'assistant', content: '[World action requested]' });
      }
      for (const action of actions) this.emit({ kind: 'world-action', action });
      this.trimHistory();
      this.emit({ kind: 'result', text: turn.text, isError: false });
      this.setStatus('ready');
    } catch (error) {
      const message = this.safeError(error);
      this.emit({ kind: 'error', message });
      this.emit({ kind: 'result', text: '', isError: true });
      this.setStatus('error', message);
    } finally {
      clearTimeout(timeout);
      this.controller = null;
    }
  }

  async interrupt(): Promise<void> {
    if (this.controller) {
      this.controller.abort(new Error('interrupted'));
      this.setStatus('interrupted');
    }
  }

  async stopSession(): Promise<void> {
    this.controller?.abort(new Error('session stopped'));
    this.controller = null;
    this.history = [];
    this.sessionId = null;
    this.setStatus('stopped');
  }

  private async callOpenAICompatible(
    observation: WorldObservation | null,
    signal: AbortSignal,
  ): Promise<ModelTurn> {
    const body = {
      model: this.activeModel,
      messages: [
        { role: 'system', content: this.systemPrompt(observation) },
        ...this.history,
      ],
      tools: [{
        type: 'function',
        function: {
          name: WORLD_ACTION_TOOL_NAME,
          description: 'Request one bounded action for your own in-game avatar.',
          parameters: WORLD_ACTION_INPUT_SCHEMA,
        },
      }],
      tool_choice: 'auto',
      max_tokens: this.config.maxTokens,
      ...(this.config.temperature === undefined
        ? {}
        : { temperature: this.config.temperature }),
    };
    const response = await this.request('/chat/completions', body, signal);
    const choice = this.record(response).choices;
    const first = Array.isArray(choice) ? this.record(choice[0]) : {};
    const resultMessage = this.record(first.message);
    const toolCalls = Array.isArray(resultMessage.tool_calls)
      ? resultMessage.tool_calls
      : [];
    const actionInputs = toolCalls.flatMap((call) => {
      const fn = this.record(this.record(call).function);
      if (fn.name !== WORLD_ACTION_TOOL_NAME || typeof fn.arguments !== 'string') return [];
      try {
        return [JSON.parse(fn.arguments)];
      } catch {
        return [null];
      }
    });
    return { text: this.textContent(resultMessage.content), actionInputs };
  }

  private async callAnthropic(
    observation: WorldObservation | null,
    signal: AbortSignal,
  ): Promise<ModelTurn> {
    const body = {
      model: this.activeModel,
      system: this.systemPrompt(observation),
      messages: this.history,
      tools: [{
        name: WORLD_ACTION_TOOL_NAME,
        description: 'Request one bounded action for your own in-game avatar.',
        input_schema: WORLD_ACTION_INPUT_SCHEMA,
      }],
      max_tokens: this.config.maxTokens,
      ...(this.config.temperature === undefined
        ? {}
        : { temperature: this.config.temperature }),
    };
    const response = await this.request('/messages', body, signal);
    const content = this.record(response).content;
    const blocks = Array.isArray(content) ? content.map((block) => this.record(block)) : [];
    return {
      text: blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join(''),
      actionInputs: blocks
        .filter((block) => block.type === 'tool_use' && block.name === WORLD_ACTION_TOOL_NAME)
        .map((block) => block.input),
    };
  }

  private async request(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.config.headers,
    };
    if (this.config.protocol === 'anthropic') {
      headers['anthropic-version'] ??= '2023-06-01';
    }
    if (this.config.apiKey) {
      if (this.config.protocol === 'anthropic') {
        headers['x-api-key'] = this.config.apiKey;
      } else {
        headers.authorization = `Bearer ${this.config.apiKey}`;
      }
    }

    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`provider returned HTTP ${response.status}`);
    }
    return response.json();
  }

  private systemPrompt(observation: WorldObservation | null): string {
    return `${COMPANION_SYSTEM_PROMPT}\nCurrent world observation:\n${serializeObservation(observation)}`;
  }

  private validateActions(inputs: unknown[]): WorldAction[] {
    const actions: WorldAction[] = [];
    for (const input of inputs.slice(0, 4)) {
      const action = parseWorldAction(input);
      if (action) actions.push(action);
      else this.emit({ kind: 'error', message: 'model requested an invalid world action; ignored' });
    }
    return actions;
  }

  private trimHistory(): void {
    if (this.history.length > 24) this.history = this.history.slice(-24);
  }

  private textContent(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';
    return value
      .map((part) => this.record(part))
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {};
  }

  private safeError(error: unknown): string {
    if (error instanceof Error && error.name === 'AbortError') return 'provider request interrupted';
    if (error instanceof Error && /timed out|interrupted|session stopped/.test(error.message)) {
      return error.message;
    }
    return error instanceof Error ? error.message : 'provider request failed';
  }
}
