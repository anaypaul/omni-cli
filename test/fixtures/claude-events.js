export const basicText = [
  '{"type":"stream_event","session_id":"sess-c1","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}}',
  '{"type":"stream_event","session_id":"sess-c1","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"world!"}}}',
].join('\n') + '\n';

export const withToolUse = [
  '{"type":"stream_event","session_id":"sess-c2","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"readFile","input":{"path":"/tmp/test.js"}}}}',
  '{"type":"stream_event","session_id":"sess-c2","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Done reading."}}}',
].join('\n') + '\n';

export const withThinking = [
  '{"type":"stream_event","session_id":"sess-c3","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Let me think..."}}}',
  '{"type":"stream_event","session_id":"sess-c3","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"My answer."}}}',
].join('\n') + '\n';

export const nonJsonMixed = 'Raw text line\n{"type":"stream_event","session_id":"sess-c4","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Parsed"}}}\n';

export const emptyLines = '\n\n{"type":"stream_event","session_id":"sess-c5","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"After blanks"}}}\n\n';
