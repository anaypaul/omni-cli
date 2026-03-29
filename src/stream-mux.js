/**
 * StreamMux — multiplexes parallel agent output into a single terminal stream.
 *
 * Each agent gets a named channel. Output is line-buffered so complete lines
 * print with a colored agent prefix. A 150ms flush timer ensures partial lines
 * still appear promptly.
 *
 *   Claude │ This is Claude's response...
 *   Codex  │ And this is from Codex, interleaved.
 */

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';

const AGENT_COLORS = {
  Claude: BLUE,
  Codex: GREEN,
};

export class StreamMux {
  constructor() {
    this.channels = new Map();
    this.maxNameLen = 0;
  }

  /**
   * Register a channel and return its onData writer function.
   */
  createWriter(name) {
    const color = AGENT_COLORS[name] || DIM;
    const channel = { name, color, buffer: '', flushTimer: null, hasOutput: false };
    this.channels.set(name, channel);
    this.maxNameLen = Math.max(this.maxNameLen, name.length);

    // Re-pad existing channels
    for (const ch of this.channels.values()) {
      ch.padded = ch.name.padEnd(this.maxNameLen);
    }

    return (text) => this._onData(name, text);
  }

  _onData(name, text) {
    const ch = this.channels.get(name);
    if (!ch) return;

    ch.buffer += text;

    // Clear pending flush
    if (ch.flushTimer) {
      clearTimeout(ch.flushTimer);
      ch.flushTimer = null;
    }

    // Write all complete lines
    const lines = ch.buffer.split('\n');
    ch.buffer = lines.pop() || '';

    for (const line of lines) {
      this._emitLine(ch, line);
    }

    // If partial buffer remains, flush after a short delay
    if (ch.buffer) {
      ch.flushTimer = setTimeout(() => {
        if (ch.buffer) {
          this._emitLine(ch, ch.buffer);
          ch.buffer = '';
        }
      }, 150);
    }
  }

  _emitLine(ch, text) {
    // Skip leading empty lines before real content starts
    if (!ch.hasOutput && !text.trim()) return;
    ch.hasOutput = true;
    const prefix = `  ${ch.color}${BOLD}${ch.padded}${RESET} ${DIM}│${RESET} `;
    process.stdout.write(`${prefix}${text}\n`);
  }

  /**
   * Flush any remaining buffered text from all channels.
   */
  flush() {
    for (const ch of this.channels.values()) {
      if (ch.flushTimer) {
        clearTimeout(ch.flushTimer);
        ch.flushTimer = null;
      }
      if (ch.buffer) {
        this._emitLine(ch, ch.buffer);
        ch.buffer = '';
      }
    }
  }
}
