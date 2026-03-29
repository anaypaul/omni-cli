import * as c from './colors.js';

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export class Renderer {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.showThinking = options.showThinking ?? true;
    this._spinnerInterval = null;
    this._spinnerFrame = 0;
  }

  handleEvent(event) {
    switch (event.type) {
      case 'text_delta': this._renderTextDelta(event); break;
      case 'tool_use': this._renderToolUse(event); break;
      case 'tool_result': this._renderToolResult(event); break;
      case 'thinking': this._renderThinking(event); break;
      case 'error': this._renderError(event); break;
      case 'done': this._renderDone(event); break;
    }
  }

  _renderTextDelta(event) {
    this._stopSpinner();
    this.stream.write(event.text);
  }

  _renderToolUse(event) {
    this._stopSpinner();
    this.stream.write('\n' + c.toolBadge(event.tool.name) + '\n');
    this._startSpinner(event.tool.name);
  }

  _renderToolResult(event) {
    this._stopSpinner();
    this.stream.write(c.toolResult(event.tool.name, !event.tool.error) + '\n');
  }

  _renderThinking(event) {
    if (this.showThinking) {
      this._startSpinner('Thinking');
    }
  }

  _renderError(event) {
    this._stopSpinner();
    this.stream.write('\n' + c.errorBlock(event.message) + '\n');
  }

  _renderDone(_event) {
    this._stopSpinner();
  }

  _startSpinner(label) {
    if (this._spinnerInterval) return;
    this._spinnerInterval = setInterval(() => {
      const frame = SPINNER_FRAMES[this._spinnerFrame % SPINNER_FRAMES.length];
      this.stream.write(`\r  ${frame} ${label}...`);
      this._spinnerFrame++;
    }, 80);
  }

  _stopSpinner() {
    if (this._spinnerInterval) {
      clearInterval(this._spinnerInterval);
      this._spinnerInterval = null;
      this.stream.write('\r' + ' '.repeat(60) + '\r');
    }
  }

  destroy() {
    this._stopSpinner();
  }
}

export function createEventHandler(options = {}) {
  const renderer = new Renderer(options);
  return (event) => renderer.handleEvent(event);
}
