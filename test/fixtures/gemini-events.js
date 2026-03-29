export const basicResponse = [
  '{"type":"init","session_id":"gemini-g1"}',
  '{"type":"message","role":"assistant","delta":true,"content":"Hello from "}',
  '{"type":"message","role":"assistant","delta":true,"content":"Gemini!"}',
].join('\n') + '\n';

export const withToolUse = [
  '{"type":"init","session_id":"gemini-g2"}',
  '{"type":"tool_use","name":"read_file","input":{"path":"/tmp/test.js"}}',
  '{"type":"tool_result","name":"read_file","output":"contents","error":null}',
  '{"type":"message","role":"assistant","delta":true,"content":"I read it."}',
].join('\n') + '\n';

export const nonAssistantMessage = [
  '{"type":"init","session_id":"gemini-g3"}',
  '{"type":"message","role":"user","delta":true,"content":"Ignored user msg"}',
  '{"type":"message","role":"assistant","delta":true,"content":"Only this"}',
].join('\n') + '\n';

export const noDeltaFlag = [
  '{"type":"init","session_id":"gemini-g4"}',
  '{"type":"message","role":"assistant","delta":false,"content":"Ignored no delta"}',
  '{"type":"message","role":"assistant","delta":true,"content":"This counts"}',
].join('\n') + '\n';

export const emptyContent = [
  '{"type":"init","session_id":"gemini-g5"}',
  '{"type":"message","role":"assistant","delta":true,"content":""}',
  '{"type":"message","role":"assistant","delta":true,"content":"Real content"}',
].join('\n') + '\n';
