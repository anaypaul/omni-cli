import { spawn } from 'node:child_process';

export class CodexAgent {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.threadId = null;
  }

  run(prompt, { onData, cwd, readOnly = false } = {}) {
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

      const proc = spawn('codex', args, {
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

            this._processEvent(event, { onData, itemTexts, messages });
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
            this._processEvent(event, { onData, itemTexts, messages });
          } catch {
            // ignore
          }
        }

        // Persist thread for next call
        if (threadId) this.threadId = threadId;

        const output = messages.join('\n').trim();
        if (code !== 0 && !output && stderrBuf.trim()) {
          reject(new Error(`Codex failed: ${stderrBuf.trim()}`));
          return;
        }

        resolve({
          output,
          stderr: stderrBuf.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          threadId,
          agent: 'codex',
        });
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Codex CLI: ${err.message}. Is it installed?`));
      });

      this._proc = proc;
    });
  }

  _processEvent(event, { onData, itemTexts, messages }) {
    const item = event.item;
    if (!item || !item.id) return;

    if (item.type === 'agent_message' && typeof item.text === 'string') {
      const prev = itemTexts.get(item.id) || '';
      const curr = item.text;

      // Stream the delta (new text since last update)
      if (curr.length > prev.length) {
        const delta = curr.slice(prev.length);
        if (onData) onData(delta);
      }

      itemTexts.set(item.id, curr);

      // On completion, save the full message
      if (event.type === 'item.completed') {
        messages.push(curr);
      }
    }
  }

  resetSession() {
    this.threadId = null;
  }

  kill() {
    if (this._proc && !this._proc.killed) {
      this._proc.kill('SIGTERM');
    }
  }
}
