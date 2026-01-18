#!/usr/bin/env node
// PTY Helper - wird von Bun als Node.js Subprocess gestartet
import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const cwd = args[0] || process.cwd();
const command = args[1] || 'zsh';
const cmdArgs = args.slice(2);

// Terminal size from environment variables or defaults
const COLS = parseInt(process.env.TERM_COLS) || 90;
const ROWS = parseInt(process.env.TERM_ROWS) || 20;

// Check if this is a --resume command that might need fallback to --session-id
const resumeIndex = cmdArgs.indexOf('--resume');
const sessionIdIndex = cmdArgs.indexOf('--session-id');
const originalSessionId = resumeIndex >= 0 ? cmdArgs[resumeIndex + 1] :
                          (sessionIdIndex >= 0 ? cmdArgs[sessionIdIndex + 1] : null);

let ptyProcess = null;
let outputBuffer = '';
let startTime = Date.now();
let hasRetried = false;

// Session update file path - the React app can read this to get the new session ID
const sessionUpdateDir = join(homedir(), '.multicode');
const sessionUpdateFile = join(sessionUpdateDir, 'session-update.json');

function startPty(cmdArgsToUse, currentSessionId) {
  ptyProcess = pty.spawn(command, cmdArgsToUse, {
    name: 'xterm-256color',
    cols: COLS,
    rows: ROWS,
    cwd,
    env: process.env,
  });

  // Daten von PTY an stdout
  ptyProcess.onData((data) => {
    // Buffer output for first 2 seconds to detect errors
    const elapsed = Date.now() - startTime;
    if (elapsed < 2000) {
      outputBuffer += data;
      // Don't show error output during detection phase - will retry silently
      if (!hasRetried && originalSessionId && resumeIndex >= 0) {
        return; // Suppress output, we might need to retry
      }
    }
    process.stdout.write(data);
  });

  // Beenden wenn PTY beendet
  ptyProcess.onExit(({ exitCode }) => {
    // If exited quickly with error and we haven't retried yet
    const elapsed = Date.now() - startTime;

    if (exitCode !== 0 && elapsed < 2000 && !hasRetried && originalSessionId) {
      // Check if it's the "No conversation found" error
      if (outputBuffer.includes('No conversation found') ||
          (outputBuffer.includes('Session ID') && outputBuffer.includes('not found'))) {
        hasRetried = true;
        startTime = Date.now();
        outputBuffer = '';

        // Generate a NEW session ID for the fallback
        const newSessionId = randomUUID();

        // Write the new session ID to a file so the React app can update its state
        try {
          mkdirSync(sessionUpdateDir, { recursive: true });
          writeFileSync(sessionUpdateFile, JSON.stringify({
            oldSessionId: originalSessionId,
            newSessionId: newSessionId,
            cwd: cwd,
            timestamp: Date.now()
          }));
        } catch (e) {
          // Ignore file write errors
        }

        // Create new args with --session-id and new UUID
        const newArgs = ['--session-id', newSessionId];

        // Start silently without error message
        startPty(newArgs, newSessionId);
        return;
      }
    }

    process.exit(exitCode);
  });
}

// Start initial PTY
startPty(cmdArgs, originalSessionId);

// Daten von stdin an PTY
process.stdin.resume();
process.stdin.on('data', (data) => {
  if (ptyProcess) {
    ptyProcess.write(data.toString());
  }
});

// Cleanup bei SIGTERM/SIGINT
process.on('SIGTERM', () => {
  if (ptyProcess) ptyProcess.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  if (ptyProcess) ptyProcess.kill();
  process.exit(0);
});
