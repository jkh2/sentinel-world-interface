import { useEffect, useRef, useState } from 'react';
import type { AgentOutputEvent, MessageSource } from '../shared/events';
import type {
  AgentSessionStatus,
  CapabilityReport,
  CliKind,
  WorkActivity,
} from '../shared/types';

interface Message {
  id: string;
  source: MessageSource;
  text: string;
  streaming?: boolean;
}

interface PermissionReq {
  id: string;
  tool?: string;
  command?: string;
}

let msgSeq = 0;
const nextId = () => `m${++msgSeq}`;

export function App(): JSX.Element {
  const [caps, setCaps] = useState<Record<CliKind, CapabilityReport | null> | null>(null);
  const [cli, setCli] = useState<CliKind>('mock');
  const [projectDir, setProjectDir] = useState<string>('');
  const [status, setStatus] = useState<AgentSessionStatus>('idle');
  const [activity, setActivity] = useState<WorkActivity>('Waiting for user');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [permission, setPermission] = useState<PermissionReq | null>(null);
  const [rawLog, setRawLog] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionUp, setSessionUp] = useState(false);

  const streamingId = useRef<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);

  // Detect installed CLIs once.
  useEffect(() => {
    window.sidlf.detectClis().then(setCaps);
  }, []);

  // Subscribe to the agent event stream.
  useEffect(() => {
    const unsub = window.sidlf.onAgentEvent((event) => handleEvent(event));
    return unsub;
  }, []);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addMessage(source: MessageSource, text: string): void {
    setMessages((m) => [...m, { id: nextId(), source, text }]);
  }

  function handleEvent(event: AgentOutputEvent): void {
    switch (event.kind) {
      case 'session-started':
        setSessionUp(true);
        addMessage('System', `Session started (${event.model ?? 'model'}) in ${event.cwd}`);
        break;
      case 'status':
        setStatus(event.status);
        if (event.status === 'thinking') setActivity('Thinking');
        else if (event.status === 'ready') setActivity('Waiting for user');
        else if (event.status === 'waiting-permission') setActivity('Waiting for permission');
        break;
      case 'tool-activity':
        if (event.phase === 'start') {
          setActivity(event.activity);
          addMessage('CLI Activity', `${event.activity}${event.summary ? ` — ${event.summary}` : ''}`);
        }
        break;
      case 'assistant-delta': {
        setMessages((m) => {
          const copy = [...m];
          const id = streamingId.current;
          const idx = id ? copy.findIndex((x) => x.id === id) : -1;
          if (idx >= 0) {
            copy[idx] = { ...copy[idx], text: copy[idx].text + event.text };
          } else {
            const nid = nextId();
            streamingId.current = nid;
            copy.push({ id: nid, source: 'AI Partner', text: event.text, streaming: true });
          }
          return copy;
        });
        break;
      }
      case 'assistant-message':
      case 'result': {
        // Finalize the streaming bubble.
        setMessages((m) => {
          const copy = [...m];
          const id = streamingId.current;
          const idx = id ? copy.findIndex((x) => x.id === id) : -1;
          if (idx >= 0) copy[idx] = { ...copy[idx], streaming: false };
          return copy;
        });
        streamingId.current = null;
        if (event.kind === 'result') setActivity('Completed');
        break;
      }
      case 'permission-request':
        setPermission({ id: event.id, tool: event.tool, command: event.command });
        setActivity('Waiting for permission');
        addMessage('Permission Request', `${event.tool ?? 'action'} requested approval`);
        break;
      case 'raw':
        setRawLog((r) => (r + event.data).slice(-20000));
        break;
      case 'error':
        addMessage('Error', event.message);
        break;
      case 'exit':
        setSessionUp(false);
        addMessage('System', `Session ended (code ${event.code})`);
        break;
    }
  }

  async function onStart(): Promise<void> {
    if (cli !== 'mock' && !projectDir) {
      addMessage('Error', 'Choose a project directory first.');
      return;
    }
    setMessages([]);
    const res = await window.sidlf.startSession({
      cli,
      cwd: projectDir || 'MOCK',
      model: cli === 'claude-code' ? 'claude-haiku-4-5-20251001' : undefined,
    });
    if (!res.ok) addMessage('Error', res.error ?? 'failed to start');
  }

  async function onSend(): Promise<void> {
    const text = input.trim();
    if (!text || !sessionUp) return;
    addMessage('Human', text);
    setInput('');
    await window.sidlf.sendMessage(text);
  }

  async function onPickDir(): Promise<void> {
    const dir = await window.sidlf.pickDirectory();
    if (dir) setProjectDir(dir);
  }

  function capLabel(kind: CliKind): string {
    const c = caps?.[kind];
    if (kind === 'mock') return 'Mock (offline)';
    if (!c) return `${kind} (not found)`;
    return `${kind} ${c.version}`;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="glyph">ב</span> SIDLF World Interface
          <span className="phase">Phase 1 · CLI Bridge</span>
        </div>
        <div className="controls">
          <select value={cli} onChange={(e) => setCli(e.target.value as CliKind)} disabled={sessionUp}>
            <option value="mock">{capLabel('mock')}</option>
            <option value="claude-code">{capLabel('claude-code')}</option>
            <option value="codex">{capLabel('codex')}</option>
          </select>
          <button onClick={onPickDir} disabled={sessionUp || cli === 'mock'} title="Choose the agent's working directory">
            {projectDir ? shorten(projectDir) : 'Choose project…'}
          </button>
          {!sessionUp ? (
            <button className="primary" onClick={onStart}>Start session</button>
          ) : (
            <button className="danger" onClick={() => window.sidlf.stopSession()}>Stop</button>
          )}
        </div>
      </header>

      <div className="statusbar">
        <span className={`dot ${status}`} />
        <span className="status-text">{status}</span>
        <span className="activity">{activity}</span>
        <span className="spacer" />
        <button className="link" onClick={() => setDrawerOpen((d) => !d)}>
          {drawerOpen ? 'Hide' : 'Show'} terminal
        </button>
      </div>

      <main className="transcript">
        {messages.length === 0 && (
          <div className="empty">
            A quiet place to work together. Pick a backend and start a session — the
            conversation runs a real CLI. The park comes next.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg src-${slug(m.source)}`}>
            <div className="src">{m.source}</div>
            <div className="text">{m.text}{m.streaming && <span className="caret">▋</span>}</div>
          </div>
        ))}
        <div ref={transcriptEnd} />
      </main>

      {permission && (
        <div className="permission">
          <div className="ptitle">Permission requested{permission.tool ? `: ${permission.tool}` : ''}</div>
          {permission.command && <pre className="pcmd">{permission.command}</pre>}
          <div className="pactions">
            <button className="primary" onClick={() => setPermission(null)}>Approve</button>
            <button className="danger" onClick={() => setPermission(null)}>Deny</button>
          </div>
          <div className="pnote">
            Approval flows to the real CLI. (Phase 1 shows the request; wiring the
            response back is the next increment.)
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="drawer">
          <div className="dhead">Raw CLI transcript (audit)</div>
          <pre className="raw">{rawLog || '(no raw output yet)'}</pre>
        </div>
      )}

      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={sessionUp ? 'Type to your partner…  (Enter to send, Shift+Enter for newline)' : 'Start a session to begin'}
          disabled={!sessionUp}
          rows={2}
        />
        <div className="cbuttons">
          <button className="primary" onClick={onSend} disabled={!sessionUp}>Send</button>
          <button onClick={() => window.sidlf.interrupt()} disabled={!sessionUp}>Interrupt</button>
        </div>
      </footer>
    </div>
  );
}

function shorten(p: string): string {
  return p.length > 34 ? '…' + p.slice(-33) : p;
}
function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}
