import { spawn } from 'node:child_process';

export class ClaudeAgent {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.sessionId = null;
  }

  run(prompt, { onData, cwd, allowTools = false } = {}) {
    return new Promise((resolve, reject) => {
      const targetCwd = cwd || this.cwd;
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
      ];

      // Resume existing session for continuity
      if (this.sessionId) {
        args.push('--resume', this.sessionId);
      }

      if (allowTools) {
        args.push('--dangerously-skip-permissions');
      }

      args.push(prompt);

      const startTime = Date.now();

      const proc = spawn('claude', args, {
        cwd: targetCwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let stderr = '';
      let sessionId = null;
      let buffer = '';

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            // Capture session ID from any event that has it
            if (event.session_id) {
              sessionId = event.session_id;
            }

            // Stream text deltas for real-time output
            if (event.type === 'stream_event') {
              const inner = event.event;
              if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
                const text = inner.delta.text;
                output += text;
                if (onData) onData(text);
              }
            }
          } catch {
            // Non-JSON line, pass through
            output += line + '\n';
            if (onData) onData(line + '\n');
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            if (event.session_id) sessionId = event.session_id;
            if (event.type === 'stream_event') {
              const inner = event.event;
              if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
                output += inner.delta.text;
              }
            }
          } catch {
            // ignore
          }
        }

        // Persist session for next call
        if (sessionId) this.sessionId = sessionId;

        resolve({
          output: output.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          sessionId,
          agent: 'claude',
        });
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Claude Code: ${err.message}. Is it installed?`));
      });

      this._proc = proc;
    });
  }

  resetSession() {
    this.sessionId = null;
  }

  kill() {
    if (this._proc && !this._proc.killed) {
      this._proc.kill('SIGTERM');
    }
  }
}
