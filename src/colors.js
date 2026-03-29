const codes = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

export const HEADER_COLORS = { Claude: codes.blue, Codex: codes.green };

export function claude(text) {
  return `${codes.blue}${text}${codes.reset}`;
}

export function codex(text) {
  return `${codes.green}${text}${codes.reset}`;
}

export function system(text) {
  return `${codes.cyan}${text}${codes.reset}`;
}

export function error(text) {
  return `${codes.red}${text}${codes.reset}`;
}

export function bold(text) {
  return `${codes.bold}${text}${codes.reset}`;
}

export function dim(text) {
  return `${codes.dim}${text}${codes.reset}`;
}

export function prompt() {
  return `${codes.bold}${codes.cyan}omni > ${codes.reset}`;
}

export function header(agent, phase) {
  const color = HEADER_COLORS[agent] || codes.cyan;
  const label = phase ? `${agent} | ${phase}` : agent;
  return `\n${color}${codes.bold}[${label}]${codes.reset} ${'─'.repeat(Math.max(1, 50 - label.length))}`;
}

export function footer() {
  return `${codes.dim}${'─'.repeat(54)}${codes.reset}\n`;
}
