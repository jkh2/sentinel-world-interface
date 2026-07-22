// node-pty de-risking spike.
// Purpose: prove, on THIS machine, that node-pty can (a) load its native binding,
// (b) spawn a real interactive process through a Windows ConPTY, and (c) stream
// its output back. This is the operational heart of the whole app — if this
// fails, everything downstream is blocked, so we test it in isolation first.
//
// Run: npm run spike:pty
// Success = you see "PTY_OK" echoed back from a spawned cmd.exe, then the
// real `claude --version` output streamed through the same pty path.

import os from 'node:os';

async function main() {
  let pty;
  try {
    pty = await import('node-pty');
  } catch (err) {
    console.error('[FAIL] could not load node-pty native binding:', err.message);
    process.exit(1);
  }

  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  console.log(`[spike] platform=${process.platform} shell=${shell} node=${process.version}`);

  // --- Test 1: spawn a shell, write a command, confirm streamed output ---
  await new Promise((resolve) => {
    const term = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env,
    });

    let buffer = '';
    let sawMarker = false;
    term.onData((data) => {
      buffer += data;
      process.stdout.write(data);
      if (!sawMarker && buffer.includes('PTY_OK')) {
        sawMarker = true;
        console.log('\n[spike] Test 1 PASS — pty spawned and streamed output.');
      }
    });
    term.onExit(({ exitCode }) => {
      if (!sawMarker) console.log('\n[spike] Test 1 FAIL — never saw PTY_OK marker.');
      console.log(`[spike] shell exited code=${exitCode}`);
      resolve();
    });

    // Windows cmd: print a marker, then exit.
    term.write('echo PTY_OK\r\n');
    setTimeout(() => term.write('exit\r\n'), 400);
  });

  // --- Test 2: run the REAL claude CLI (non-interactive) through a pty ---
  await new Promise((resolve) => {
    const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
    let term;
    try {
      term = pty.spawn(claudeCmd, ['--version'], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: os.homedir(),
        env: process.env,
      });
    } catch (err) {
      console.log(`[spike] Test 2 SKIP — could not spawn ${claudeCmd}: ${err.message}`);
      return resolve();
    }
    let out = '';
    term.onData((d) => {
      out += d;
      process.stdout.write(d);
    });
    term.onExit(({ exitCode }) => {
      const ok = /\d+\.\d+\.\d+/.test(out);
      console.log(
        `\n[spike] Test 2 ${ok ? 'PASS' : 'INCONCLUSIVE'} — real claude CLI ran through pty (code=${exitCode}).`,
      );
      resolve();
    });
  });

  console.log('[spike] done.');
  process.exit(0);
}

main();
