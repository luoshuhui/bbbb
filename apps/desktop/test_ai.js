const { uiMessageChunkSchema } = require('ai');

console.log(uiMessageChunkSchema.safeParse({ type: 'text-delta', textDelta: 'hello' }).error?.issues[0]?.errors);
