import { useEffect, useRef, useState } from 'react';
import { WorldCanvas } from './world/WorldCanvas';
import { VoxelWorld } from './world/voxel/VoxelWorld';
import { PLACEABLE, GRASS, STONE, blockName, type BlockId } from './world/voxel/blocks';
import type { AgentOutputEvent, MessageSource } from '../shared/events';
import type { AgentSessionStatus, CapabilityReport, CliKind } from '../shared/types';
import type { WorldAction } from '../shared/worldActions';
import type { WorldObservation } from '../main/bridge/worldCognitionContract';
import type { DayPhase } from './world/DayNight';

/** Honest avatar labeling: only claim an identity when a real session is
 *  actually driving it through validated tools — never as a fixed default. */
function driverNameFor(cli: CliKind, sessionUp: boolean): string {
  if (!sessionUp) return 'AI companion (idle)';
  if (cli === 'claude-code') return 'ב Claude Sentinel';
  if (cli === 'codex') return 'AI companion (Codex)';
  return 'AI companion (mock)';
}

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

// Quick actions: canned chat messages, not a client-side world-action
// shortcut — the live companion still decides what to actually do with them
// through its own tool calls. Each has a hotkey that fires with zero unlock:
// keydown reaches window listeners regardless of pointer-lock state, so these
// work mid-fight without ever leaving the game.
const QUICK_ACTIONS: { code: string; label: string; text: string }[] = [
  { code: 'KeyG', label: 'Come here (G)', text: 'Come here — I need you.' },
  { code: 'KeyH', label: 'Help! (H)', text: "Help! There's danger on me right now." },
];

export function App(): JSX.Element {
  // --- world ---
  const [world] = useState(() => new VoxelWorld());
  const [version, setVersion] = useState(0);
  const [inventory, setInventory] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<BlockId>(GRASS);
  const [locked, setLocked] = useState(false);

  // --- session / chat ---
  const [caps, setCaps] = useState<Record<CliKind, CapabilityReport | null> | null>(null);
  const [cli, setCli] = useState<CliKind>('mock');
  const [projectDir, setProjectDir] = useState('');
  const [status, setStatus] = useState<AgentSessionStatus>('idle');
  const [activity, setActivity] = useState('here with you');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [permission, setPermission] = useState<PermissionReq | null>(null);
  const [sessionUp, setSessionUp] = useState(false);
  const [speech, setSpeech] = useState('');
  const [agentCommand, setAgentCommand] = useState<WorldAction | null>(null);

  // Day/night
  const [dayPhase, setDayPhase] = useState<DayPhase>('Day');
  const [isNight, setIsNight] = useState(false);
  const [clock, setClock] = useState('06:00');
  const [zombieCount, setZombieCount] = useState(0);

  // Survival
  const [hp, setHp] = useState(100);
  const [wood, setWood] = useState(0);
  const [fruit, setFruit] = useState(0);
  const [hasSpear, setHasSpear] = useState(false);
  const [respawnSignal, setRespawnSignal] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [dayReset, setDayReset] = useState(0);

  // Floating chat window — persistent, movable, resizable; never tied to
  // pointer-lock state (that was the bug: clicking re-locked and hid it).
  const [chatOpen, setChatOpen] = useState(true);
  const [chatPos, setChatPos] = useState({ x: Math.max(20, window.innerWidth - 420), y: 56 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const streamingId = useRef<string | null>(null);
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const pendingSend = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  function resumePlay(): void {
    document.querySelector('canvas')?.requestPointerLock();
  }

  function onDragStart(e: React.PointerEvent): void {
    dragRef.current = { dx: e.clientX - chatPos.x, dy: e.clientY - chatPos.y };
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      setChatPos({ x: ev.clientX - dragRef.current.dx, y: ev.clientY - dragRef.current.dy });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Detect CLIs + track pointer-lock state.
  useEffect(() => {
    window.sidlf.detectClis().then(setCaps);
    const onLock = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  // Block selection with number keys (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= PLACEABLE.length) setSelected(PLACEABLE[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Agent event stream.
  useEffect(() => window.sidlf.onAgentEvent(handleEvent), []);

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
        setActivity('here with you');
        addMessage('System', `Session started (${event.model ?? 'model'}) in ${event.cwd}`);
        // Flush a message the human sent before the session was up (auto-start).
        if (pendingSend.current) {
          const msg = pendingSend.current;
          pendingSend.current = null;
          addMessage('Human', msg);
          setSpeech('');
          window.sidlf.sendMessage(msg);
        }
        break;
      case 'status':
        setStatus(event.status);
        if (event.status === 'thinking') setActivity('thinking…');
        else if (event.status === 'streaming') setActivity('speaking…');
        else if (event.status === 'ready') setActivity('here with you');
        else if (event.status === 'waiting-permission') setActivity('awaiting your approval');
        break;
      case 'tool-activity':
        if (event.phase === 'start') {
          setActivity(event.activity);
          addMessage('CLI Activity', `${event.activity}${event.summary ? ` — ${event.summary}` : ''}`);
        }
        break;
      case 'assistant-delta':
        setSpeech((s) => (s + event.text).slice(-280));
        setMessages((m) => {
          const copy = [...m];
          const id = streamingId.current;
          const idx = id ? copy.findIndex((x) => x.id === id) : -1;
          if (idx >= 0) copy[idx] = { ...copy[idx], text: copy[idx].text + event.text };
          else {
            const nid = nextId();
            streamingId.current = nid;
            copy.push({ id: nid, source: 'AI Partner', text: event.text, streaming: true });
          }
          return copy;
        });
        break;
      case 'assistant-message':
      case 'result':
        setMessages((m) => {
          const copy = [...m];
          const id = streamingId.current;
          const idx = id ? copy.findIndex((x) => x.id === id) : -1;
          if (idx >= 0) copy[idx] = { ...copy[idx], streaming: false };
          return copy;
        });
        streamingId.current = null;
        if (event.kind === 'result') setActivity('here with you');
        break;
      case 'world-action': {
        setAgentCommand(event.action);
        const a = event.action;
        const desc = 'target' in a ? `${a.action} → ${a.target}` : a.action;
        addMessage('World Action', desc);
        break;
      }
      case 'permission-request':
        setPermission({ id: event.id, tool: event.tool, command: event.command });
        setActivity('awaiting your approval');
        addMessage('Permission Request', `${event.tool ?? 'action'} requested approval`);
        break;
      case 'error':
        addMessage('Error', event.message);
        break;
      case 'exit':
        setSessionUp(false);
        setActivity('start a session to talk');
        addMessage('System', `Session ended (code ${event.code})`);
        break;
    }
  }

  // --- world edits ---
  const onDig = (id: BlockId): void => {
    setInventory((inv) => ({ ...inv, [id]: (inv[id] ?? 0) + 1 }));
    setVersion((v) => v + 1);
  };
  const onPlace = (id: BlockId): void => {
    setInventory((inv) => ({ ...inv, [id]: Math.max(0, (inv[id] ?? 0) - 1) }));
    setVersion((v) => v + 1);
  };
  const onDayTick = (t: number, night: boolean, phase: DayPhase): void => {
    setDayPhase(phase);
    setIsNight(night);
    const hrs = t * 24;
    const hh = Math.floor(hrs);
    const mm = Math.floor((hrs - hh) * 60);
    setClock(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  };

  // Survival actions
  const onHarvestTree = (): void => {
    setWood((w) => w + 2);
    setFruit((f) => f + 1);
  };
  const craftSpear = (): void => {
    if (hasSpear) return;
    if (wood >= 2 && (inventory[STONE] ?? 0) >= 1) {
      setWood((w) => w - 2);
      setInventory((inv) => ({ ...inv, [STONE]: (inv[STONE] ?? 0) - 1 }));
      setHasSpear(true);
      addMessage('System', 'Crafted a spear! Left-click a zombie to strike it.');
    } else {
      addMessage('System', 'Need 2 wood + 1 stone for a spear. Chop trees, mine stone.');
    }
  };
  const eatFruit = (): void => {
    if (fruit > 0 && hp < 100) {
      setFruit((f) => f - 1);
      setHp((h) => Math.min(100, h + 25));
    }
  };
  const onPlayerDamage = (d: number): void => {
    if (gameOver) return;
    setHp((h) => {
      const nh = h - d;
      if (nh <= 0) {
        setGameOver(true);
        setRespawnSignal((s) => s + 1); // clear the horde
        if (document.pointerLockElement) document.exitPointerLock();
        return 0;
      }
      return nh;
    });
  };
  const restartGame = (): void => {
    setGameOver(false);
    setHp(100);
    setWood(0);
    setFruit(0);
    setHasSpear(false);
    setInventory({});
    setRespawnSignal((s) => s + 1); // clear zombies
    setDayReset((s) => s + 1); // back to morning
    addMessage('System', 'New game. The valley is fresh — survive.');
  };

  // Craft (C) / eat fruit (F) keys — usable during locked play; ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyC') craftSpear();
      if (e.code === 'KeyF') eatFruit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wood, fruit, hp, hasSpear, inventory]);

  // --- session actions ---
  async function onStart(): Promise<void> {
    if (cli !== 'mock' && !projectDir) {
      addMessage('Error', 'Choose a project directory first.');
      return;
    }
    setMessages([]);
    setSpeech('');
    const res = await window.sidlf.startSession({
      cli,
      cwd: projectDir || 'MOCK',
      model: cli === 'claude-code' ? 'claude-haiku-4-5-20251001' : undefined,
    });
    if (!res.ok) addMessage('Error', res.error ?? 'failed to start');
  }
  async function sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!sessionUp) {
      // No session yet — auto-start the selected backend; the message flushes
      // on session-started. (Mock is the default and needs no project dir.)
      pendingSend.current = trimmed;
      await onStart();
      return;
    }
    addMessage('Human', trimmed);
    setSpeech('');
    await window.sidlf.sendMessage(trimmed);
  }

  async function onSend(): Promise<void> {
    const text = input;
    setInput('');
    await sendText(text);
  }

  /** Fired mid-gameplay, still pointer-locked — no unlock, no focus change. */
  async function sendQuickAction(text: string): Promise<void> {
    await sendText(text);
  }

  // Chat hotkeys: T opens the composer and takes focus (exits pointer lock,
  // since typing needs a real cursor); Escape-in-composer returns to play.
  // G/H are canned quick actions that fire with zero unlock at all — the
  // whole point being you never have to stop fighting to use them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (typing) return;
      if (e.code === 'KeyT') {
        e.preventDefault();
        setChatOpen(true);
        if (document.pointerLockElement) document.exitPointerLock();
        requestAnimationFrame(() => composerRef.current?.focus());
        return;
      }
      const quick = QUICK_ACTIONS.find((q) => q.code === e.code);
      if (quick) {
        e.preventDefault();
        void sendQuickAction(quick.text);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUp]);
  async function onPickDir(): Promise<void> {
    const dir = await window.sidlf.pickDirectory();
    if (dir) setProjectDir(dir);
  }

  const bubbleStatus = !sessionUp
    ? 'start a session to talk'
    : activity;
  const canPlace = (inventory[selected] ?? 0) > 0;

  return (
    <div className="world-root" onContextMenu={(e) => e.preventDefault()}>
      <WorldCanvas
        world={world}
        version={version}
        selectedBlock={selected}
        canPlace={canPlace}
        onDig={onDig}
        onPlace={onPlace}
        agentStatus={bubbleStatus}
        agentSpeech={locked ? speech : ''}
        agentCommand={agentCommand}
        agentDriverName={driverNameFor(cli, sessionUp)}
        onAgentWorldEdit={() => setVersion((v) => v + 1)}
        onObservation={(observation: WorldObservation) => window.sidlf.setObservation(observation)}
        onDayTick={onDayTick}
        isNight={isNight}
        onZombieCount={setZombieCount}
        onHarvestTree={onHarvestTree}
        hasSpear={hasSpear}
        respawnSignal={respawnSignal}
        onPlayerDamage={onPlayerDamage}
        paused={gameOver}
        dayResetSignal={dayReset}
      />

      {/* crosshair — only while in the valley */}
      {locked && <div className="crosshair">＋</div>}

      {/* day/night clock */}
      <div className={`daybadge ${isNight ? 'night' : ''}`}>
        {dayPhase === 'Dawn' ? '🌅' : dayPhase === 'Day' ? '☀️' : dayPhase === 'Dusk' ? '🌇' : '🌙'}{' '}
        {clock} · {dayPhase}
        {zombieCount > 0 ? ` · 🧟 ${zombieCount}` : ''}
      </div>

      {/* survival HUD */}
      <div className="survival">
        <div className="hbar">
          <div className="hbar-fill" style={{ width: `${hp}%` }} />
          <span className="hbar-txt">{hp} HP</span>
        </div>
        <div className="stats">
          🪵 {wood} · 🍎 {fruit} · {hasSpear ? '🗡 spear' : 'unarmed'}
        </div>
        <div className="sbtns">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={craftSpear}
            disabled={hasSpear || wood < 2 || (inventory[STONE] ?? 0) < 1}
          >
            Craft Spear (C)
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={eatFruit}
            disabled={fruit < 1 || hp >= 100}
          >
            Eat Fruit (F)
          </button>
        </div>
      </div>

      {/* inventory HUD */}
      <div className="inv">
        {PLACEABLE.map((id, i) => (
          <button
            key={id}
            className={`inv-slot ${selected === id ? 'sel' : ''}`}
            onClick={() => setSelected(id)}
            title={`${blockName(id)} (${i + 1})`}
          >
            <span className={`swatch b${id}`} />
            <span className="inv-name">{blockName(id)}</span>
            <span className="inv-count">{inventory[id] ?? 0}</span>
            <span className="inv-key">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* controls hint */}
      <div className="hint">
        {locked
          ? 'WASD move · L-click dig / chop tree / strike zombie · R-click place · 1–4 block · C spear · F fruit · N/M night/day · T talk · G come here · H help! · Esc menu'
          : 'Click the valley to enter · chop trees, mine stone, craft a spear, survive the night · T to talk, Esc to return to play'}
      </div>

      {/* toggle — always available */}
      {!chatOpen && (
        <button
          className="chat-toggle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setChatOpen(true)}
        >
          💬 chat
        </button>
      )}

      {/* Persistent, movable, resizable chat + controls window. stopPropagation
          on pointer-down means clicking it never re-locks the world. */}
      {chatOpen && (
        <div
          className="chatwin"
          style={{ left: chatPos.x, top: chatPos.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="chatwin-head" onPointerDown={onDragStart}>
            <span className="glyph">ב</span>
            <span className="chatwin-title">SIDLF · chat &amp; controls</span>
            <span className="chatwin-spacer" />
            <button className="link" onPointerDown={(e) => e.stopPropagation()} onClick={() => setChatOpen(false)}>
              hide
            </button>
          </div>

          <div className="chatwin-controls">
            <select value={cli} onChange={(e) => setCli(e.target.value as CliKind)} disabled={sessionUp}>
              <option value="mock">Mock (offline)</option>
              <option value="claude-code">claude-code {caps?.['claude-code']?.version ?? '(none)'}</option>
              <option value="codex">codex {caps?.codex?.version ?? '(none)'}</option>
            </select>
            <button onClick={onPickDir} disabled={sessionUp || cli === 'mock'}>
              {projectDir ? '…' + projectDir.slice(-20) : 'Project…'}
            </button>
            {!sessionUp ? (
              <button className="primary" onClick={onStart}>Start</button>
            ) : (
              <button className="danger" onClick={() => window.sidlf.stopSession()}>Stop</button>
            )}
          </div>

          <div className="chat-status">
            <span className={`dot ${status}`} /> {status} · <span className="muted">{activity}</span>
          </div>

          <div className="chat-log">
            {messages.length === 0 && (
              <div className="empty">
                A quiet valley to build in and think in. Dig, place, walk — and just
                type below to talk with me (a session starts automatically). Press
                <b> Esc</b> to free the cursor, then click here to type. Drag this window's
                title bar to move it; drag its corner to resize.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg src-${slug(m.source)}`}>
                <div className="src">{m.source}</div>
                <div className="text">{m.text}{m.streaming && <span className="caret">▋</span>}</div>
              </div>
            ))}
            <div ref={transcriptEnd} />
          </div>

          <div className="quick-actions">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.code}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => sendQuickAction(q.text)}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="composer">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend().then(resumePlay);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                  resumePlay();
                }
              }}
              placeholder={sessionUp ? 'Type to your partner… (Esc to return to play)' : 'Type to your partner… (starts a session automatically)'}
              rows={2}
            />
            <div className="cbtns">
              <button className="primary" onClick={() => onSend().then(resumePlay)}>Send</button>
              <button onClick={() => window.sidlf.interrupt()} disabled={!sessionUp}>Stop</button>
            </div>
          </div>
        </div>
      )}

      {permission && (
        <div className="permission">
          <div className="ptitle">Permission requested{permission.tool ? `: ${permission.tool}` : ''}</div>
          {permission.command && <pre className="pcmd">{permission.command}</pre>}
          <div className="pactions">
            <button className="primary" onClick={() => setPermission(null)}>Approve</button>
            <button className="danger" onClick={() => setPermission(null)}>Deny</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="gameover">
          <div className="go-title">You Died</div>
          <div className="go-sub">The valley fell quiet. The horde took you.</div>
          <button className="primary go-btn" onClick={restartGame}>Start a New Game</button>
        </div>
      )}
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}
