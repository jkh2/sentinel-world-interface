// The world-action MCP server — the "eyes and hands" a live Claude session
// gets in the game, run as its own subprocess of the `claude` CLI via
// --mcp-config. Two tools only: look (get_world_observation) and act
// (world_action). No filesystem, shell, or other surface — this process
// exists solely to bridge into the running Electron game over loopback HTTP.
//
// Run via: tsx scripts/world-mcp-server.ts
// Requires: WORLD_BRIDGE_PORT env var (set by ClaudeCodeAdapter's spawn env).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  WORLD_ACTION_INPUT_SCHEMA,
  WORLD_ACTION_TOOL_NAME,
} from '../src/main/bridge/worldCognitionContract';

const GET_OBSERVATION_TOOL = 'get_world_observation';

const port = process.env.WORLD_BRIDGE_PORT;
if (!port || !/^\d+$/.test(port)) {
  console.error('world-mcp-server: WORLD_BRIDGE_PORT env var missing or invalid; exiting.');
  process.exit(1);
}
const bridgeBase = `http://127.0.0.1:${port}`;

const tools: Tool[] = [
  {
    name: GET_OBSERVATION_TOOL,
    description:
      'See the current state of the shared world: your surroundings, your partner, ' +
      'and any visible threats. Bounded and possibly incomplete — call this whenever ' +
      'you need fresh eyes before deciding what to do.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: WORLD_ACTION_TOOL_NAME,
    description:
      'Request one bounded action for your own in-game avatar. The game engine ' +
      'validates and executes every request; never assume it succeeded just because ' +
      'you asked — read the returned result.',
    // WORLD_ACTION_INPUT_SCHEMA is `as const` (readonly) in the shared
    // contract; the SDK's Tool type wants a mutable JSON-schema shape. Same
    // JSON either way — this is a type-level cast only, not a data change.
    inputSchema: WORLD_ACTION_INPUT_SCHEMA as unknown as Tool['inputSchema'],
  },
];

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text }], isError };
}

async function callGetObservation(): Promise<CallToolResult> {
  try {
    const res = await fetch(`${bridgeBase}/observation`);
    const body = await res.json();
    return textResult(JSON.stringify(body));
  } catch (err) {
    return textResult(`Could not reach the world: ${errorMessage(err)}`, true);
  }
}

async function callWorldAction(args: Record<string, unknown> | undefined): Promise<CallToolResult> {
  try {
    const res = await fetch(`${bridgeBase}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args ?? {}),
    });
    const body = await res.json();
    return textResult(JSON.stringify(body), !res.ok);
  } catch (err) {
    return textResult(`Could not reach the world: ${errorMessage(err)}`, true);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  const server = new Server(
    { name: 'sidlf-world-actions', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === GET_OBSERVATION_TOOL) return callGetObservation();
    if (name === WORLD_ACTION_TOOL_NAME) return callWorldAction(args);
    return textResult(`Unknown tool: ${name}`, true);
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('world-mcp-server: fatal error:', err);
  process.exit(1);
});
