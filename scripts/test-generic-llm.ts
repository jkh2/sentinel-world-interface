import { GenericLLMAdapter } from '../src/main/bridge/GenericLLMAdapter';
import { serializeObservation } from '../src/main/bridge/worldCognitionContract';
import type { AgentOutputEvent } from '../src/shared/events';

let failures = 0;
function check(name: string, condition: boolean): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failures += 1;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function openAICompatibleTest(): Promise<void> {
  console.log('\n[GenericLLM/OpenAI-compatible] offline contract test');
  let request: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({
      choices: [{
        message: {
          content: 'I am coming to the pond.',
          tool_calls: [{
            function: {
              name: 'world_action',
              arguments: JSON.stringify({ action: 'walk_to', target: 'pond_edge' }),
            },
          }],
        },
      }],
    });
  };
  const adapter = new GenericLLMAdapter({
    protocol: 'openai-compatible',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    apiKey: 'not-a-real-key',
  }, { fetch: fakeFetch });
  const events: AgentOutputEvent[] = [];
  adapter.onOutput((event) => events.push(event));
  adapter.setObservation({
    schemaVersion: 1,
    observedAt: '2026-07-22T23:00:00Z',
    context: { mode: 'outdoor', phase: 'day', biome: 'high-desert valley' },
    self: { name: 'Companion', area: 'spawn_agent' },
    party: [{
      name: 'Human',
      kind: 'human',
      area: 'pond_edge',
      distance: 12,
      bearingDegrees: 35,
      visible: true,
      status: 'active',
    }],
    navigation: {
      areaName: 'park clearing',
      routes: [{
        label: 'path to pond',
        destination: 'pond_edge',
        state: 'open',
        knowledge: 'perceived',
      }],
    },
  });
  await adapter.startSession({ cli: 'mock', cwd: '' });
  await adapter.sendMessage('Come meet me.');

  const actions = events.filter(
    (event): event is Extract<AgentOutputEvent, { kind: 'world-action' }> =>
      event.kind === 'world-action',
  );
  check('sends a real tool definition', Array.isArray(request.tools));
  check('emits validated walk action', actions[0]?.action.action === 'walk_to');
  check('emits natural companion text', events.some(
    (event) => event.kind === 'assistant-message' && event.text.includes('pond'),
  ));
  check('does not expose a CLI capability', adapter.getCapability()?.mcpAvailable === false);
  check('uses configured model', request.model === 'test-model');
}

async function anthropicTest(): Promise<void> {
  console.log('\n[GenericLLM/Anthropic] offline contract test');
  const fakeFetch: typeof fetch = async () => jsonResponse({
    content: [
      { type: 'text', text: 'I will help with the wall.' },
      { type: 'tool_use', name: 'world_action', input: { action: 'place_front', block: 'stone' } },
      { type: 'tool_use', name: 'world_action', input: { action: 'walk_to', target: 'raw-coordinate' } },
    ],
  });
  const adapter = new GenericLLMAdapter({
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.test/v1',
    model: 'test-model',
    apiKey: 'not-a-real-key',
  }, { fetch: fakeFetch });
  const events: AgentOutputEvent[] = [];
  adapter.onOutput((event) => events.push(event));
  await adapter.startSession({ cli: 'mock', cwd: '' });
  await adapter.sendMessage('Build here.');

  const actions = events.filter((event) => event.kind === 'world-action');
  check('emits the valid build action', actions.length === 1);
  check('rejects invalid model target', events.some(
    (event) => event.kind === 'error' && event.message.includes('invalid world action'),
  ));
}

async function configSafetyTest(): Promise<void> {
  console.log('\n[GenericLLM/config] safety test');
  let rejected = false;
  try {
    new GenericLLMAdapter({
      protocol: 'openai-compatible',
      baseUrl: 'http://remote.example.test/v1',
      model: 'unsafe',
    });
  } catch {
    rejected = true;
  }
  check('rejects plaintext remote provider URL', rejected);

  let acceptedLoopback = true;
  try {
    new GenericLLMAdapter({
      protocol: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local-model',
    });
  } catch {
    acceptedLoopback = false;
  }
  check('allows plaintext loopback local model', acceptedLoopback);
}

function observationBoundsTest(): void {
  console.log('\n[WorldObservation] bounds test');
  const serialized = serializeObservation({
    schemaVersion: 1,
    observedAt: '2026-07-23T00:00:00Z',
    context: { mode: 'structure', light: 'dark' },
    self: { area: 'farmhouse_cellar' },
    threats: Array.from({ length: 30 }, (_, index) => ({
      id: `zombie-${index}`,
      type: 'zombie',
      distance: index + 1,
      visible: true,
      state: 'pursuing' as const,
    })),
  });
  const parsed = JSON.parse(serialized) as { threats?: unknown[] };
  check('clips threats before provider serialization', parsed.threats?.length === 24);
}

async function main(): Promise<void> {
  await openAICompatibleTest();
  await anthropicTest();
  await configSafetyTest();
  observationBoundsTest();
  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
