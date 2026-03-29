/**
 * @typedef {Object} AgentEvent
 * @property {string} type - Event type
 * @property {string} agent - Agent name
 * @property {number} ts - Timestamp (Date.now())
 */

export const EVENT_TYPES = new Set([
  'text_delta', 'tool_use', 'tool_result', 'thinking', 'error', 'done',
]);

export function textDelta(agent, text) {
  return Object.freeze({ type: 'text_delta', agent, text, ts: Date.now() });
}

export function toolUse(agent, name, input) {
  return Object.freeze({ type: 'tool_use', agent, tool: { name, input }, ts: Date.now() });
}

export function toolResult(agent, name, output, error = null) {
  return Object.freeze({ type: 'tool_result', agent, tool: { name, output, error }, ts: Date.now() });
}

export function thinking(agent, text) {
  return Object.freeze({ type: 'thinking', agent, text, ts: Date.now() });
}

export function error(agent, message) {
  return Object.freeze({ type: 'error', agent, message, ts: Date.now() });
}

export function done(agent, result) {
  return Object.freeze({ type: 'done', agent, result, ts: Date.now() });
}

export function extractText(event) {
  return event.type === 'text_delta' ? event.text : null;
}
