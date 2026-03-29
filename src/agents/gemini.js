import { spawn } from 'node:child_process';
import { BaseAgent } from './base.js';

export class GeminiAgent extends BaseAgent {
  constructor(options = {}) {
    super(options);
  }

  get name() {
    return 'gemini';
  }

  async run(prompt, { onData, cwd, allowTools = false } = {}) {
    return new Promise((resolve, reject) => {
      const targetCwd = cwd || this.cwd;
      const args = ['--output-format', 'stream-json'];

      if (allowTools) {
        args.push('--yolo');
      }

      if (this.sessionId) {
        args.push('--resume', this.sessionId);
        args.push('-p', prompt);
      } else {
        args.push(prompt);
      }

      const proc = spawn('gemini', args, {
        cwd: targetCwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this._proc = proc;

      let output = '';
      let stderrBuf = '';
      let sessionId = null;
      let buffer = '';
      const startTime = Date.now();

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);

            if (event.type === 'init' && event.session_id) {
              sessionId = event.session_id;
            }

            if (event.type === 'message' && event.role === 'assistant' && event.delta) {
              const text = event.content;
              if (text) {
                output += text;
                if (onData) onData(text);
              }
            }
          } catch {
            output += line + '\n';
            if (onData) onData(line + '\n');
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
      });

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            if (event.type === 'init' && event.session_id) {
              sessionId = event.session_id;
            }
            if (event.type === 'message' && event.role === 'assistant' && event.delta) {
              if (event.content) {
                output += event.content;
                if (onData) onData(event.content);
              }
            }
          } catch {
            // ignore
          }
        }

        if (sessionId) this.sessionId = sessionId;

        resolve({
          output: output.trim(),
          stderr: stderrBuf.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          sessionId,
          agent: this.name,
        });
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Gemini CLI: ${err.message}. Is it installed? Install with: npm i -g @anthropic-ai/gemini-cli`));
      });
    });
  }
}
