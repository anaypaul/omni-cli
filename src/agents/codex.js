import { spawn } from 'node:child_process';
import { BaseAgent } from './base.js';
import * as events from '../events.js';

export class CodexAgent extends BaseAgent {
  constructor(options = {}) {
    super(options);
  }

  get name() { return 'codex'; }

  get threadId() { return this.sessionId; }
  set threadId(value) { this.sessionId = value; }

  run(prompt, { onData, onEvent, cwd, readOnly = false } = {}) {
    return new Promise((resolve, reject) => {
      const targetCwd = cwd || this.cwd;
      const args = ['exec'];

      if (readOnly) {
        args.push('--sandbox', 'read-only');
      } else {
        args.push('--full-auto');
      }

      args.push('--skip-git-repo-check', '--json');

      // Resume existing thread for continuity
      if (this.threadId) {
        args.push('resume', this.threadId);
      }

      args.push(prompt);

      const startTime = Date.now();

      const spawnFn = this._spawn || spawn;
      const proc = spawnFn('codex', args, {
        cwd: targetCwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const messages = [];
      let stderrBuf = '';
      let buffer = '';
      let threadId = null;
      const itemTexts = new Map();

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Capture thread ID
            if (event.type === 'thread.started' && event.thread_id) {
              threadId = event.thread_id;
            }

            this._processEvent(event, { onData, onEvent, itemTexts, messages });
          } catch {
            // Non-JSON line, pass through
            if (onData) onData(line + '\n');
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
      });

      proc.on('close', (code) => {
        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            if (event.type === 'thread.started' && event.thread_id) {
              threadId = event.thread_id;
            }
            this._processEvent(event, { onData, onEvent, itemTexts, messages });
          } catch {
            // ignore
          }
        }

        // Persist thread for next call
        if (threadId) this.threadId = threadId;

        const output = messages.join('\n').trim();
        if (code !== 0 && !output && stderrBuf.trim()) {
          if (onEvent) onEvent(events.error('codex', stderrBuf.trim()));
          reject(new Error(`Codex failed: ${stderrBuf.trim()}`));
          return;
        }

        if (onEvent) onEvent(events.done('codex', { output, exitCode: code }));

        resolve({
          output,
          stderr: stderrBuf.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          sessionId: threadId,
          agent: this.name,
        });
      });

      proc.on('error', (err) => {
        if (onEvent) onEvent(events.error('codex', err.message));
        reject(new Error(`Failed to start Codex CLI: ${err.message}. Is it installed?`));
      });

      this._proc = proc;
    });
  }

  _processEvent(event, { onData, onEvent, itemTexts, messages }) {
    const item = event.item;
    if (!item || !item.id) return;

    if (item.type === 'agent_message' && typeof item.text === 'string') {
      const prev = itemTexts.get(item.id) || '';
      const curr = item.text;

      // Stream the delta (new text since last update)
      if (curr.length > prev.length) {
        const delta = curr.slice(prev.length);
        if (onData) onData(delta);
        if (onEvent) onEvent(events.textDelta('codex', delta));
      }

      itemTexts.set(item.id, curr);

      // On completion, save the full message
      if (event.type === 'item.completed') {
        messages.push(curr);
      }
    }

    if (item.type === 'tool_call') {
      if (onEvent) onEvent(events.toolUse('codex', item.name || 'tool', item.arguments || {}));
    }

    if (item.type === 'tool_output') {
      if (onEvent) onEvent(events.toolResult('codex', item.name || 'tool', item.output || '', item.error || null));
    }
  }

}
