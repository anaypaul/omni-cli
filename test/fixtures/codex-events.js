export const basicResponse = [
  '{"type":"thread.started","thread_id":"thread-x1"}',
  '{"type":"item.completed","item":{"id":"msg_001","type":"agent_message","text":"Hello from Codex!"}}',
].join('\n') + '\n';

export const progressiveDeltas = [
  '{"type":"thread.started","thread_id":"thread-x2"}',
  '{"type":"item.updated","item":{"id":"msg_001","type":"agent_message","text":"Hel"}}',
  '{"type":"item.updated","item":{"id":"msg_001","type":"agent_message","text":"Hello "}}',
  '{"type":"item.updated","item":{"id":"msg_001","type":"agent_message","text":"Hello world"}}',
  '{"type":"item.completed","item":{"id":"msg_001","type":"agent_message","text":"Hello world!"}}',
].join('\n') + '\n';

export const withToolCall = [
  '{"type":"thread.started","thread_id":"thread-x3"}',
  '{"type":"item.created","item":{"id":"tool_001","type":"tool_call","name":"shell","arguments":{"cmd":"ls"}}}',
  '{"type":"item.created","item":{"id":"out_001","type":"tool_output","name":"shell","output":"file1.txt","error":null}}',
  '{"type":"item.completed","item":{"id":"msg_001","type":"agent_message","text":"Done."}}',
].join('\n') + '\n';

export const multipleMessages = [
  '{"type":"thread.started","thread_id":"thread-x4"}',
  '{"type":"item.completed","item":{"id":"msg_001","type":"agent_message","text":"First."}}',
  '{"type":"item.completed","item":{"id":"msg_002","type":"agent_message","text":"Second."}}',
].join('\n') + '\n';
