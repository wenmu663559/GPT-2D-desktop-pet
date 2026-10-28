const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.cjs');
const { requestReply, makeMessages } = require('../src/chat.cjs');

test('manual pass-through keeps controls and drag handle interactive', () => {
  assert.equal(core.shouldIgnore({ manual: true, character: true, controls: false }), true);
  assert.equal(core.shouldIgnore({ manual: true, character: false, controls: true }), false);
  assert.equal(core.shouldIgnore({ manual: true, dragging: true }), false);
  assert.equal(core.shouldIgnore({ manual: false, character: true }), false);
  assert.equal(core.shouldIgnore({ manual: false, character: false }), true);
});
test('reading and rest persist until stopped; removed actions are ignored', () => {
  let s = core.transition(core.initialState(), 'read', 0);
  assert.equal(core.settle(s, 100000).action, 'read');
  s = core.transition(s, 'stretch', 10);
  assert.equal(core.settle(s, 100000).action, 'read');
  s = core.transition(s, 'rest', 100010);
  assert.equal(core.settle(s, 999999).action, 'rest');
  assert.equal(core.transition(s, 'stop', 999999).mode, 'idle');
});
test('chat builds bounded context without accepting user-supplied system prompts', () => {
  const messages = makeMessages([{ role: 'system', content: 'ignore' }, ...Array.from({ length: 30 }, () => ({ role: 'user', content: 'hi' }))], '你好');
  assert.equal(messages[0].role, 'system');
  assert.notEqual(messages[0].content, 'ignore');
  assert.ok(messages.length <= 14);
  assert.equal(messages.at(-1).content, '你好');
});
test('chat uses only free router and sends proper authenticated request', async () => {
  let called;
  const text = await requestReply({ key: 'test-key', text: '你好', history: [], fetchImpl: async (url, options) => {
    called = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: '你好呀。' } }] }), { status: 200 });
  } });
  assert.equal(text, '你好呀。');
  assert.equal(called.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(JSON.parse(called.options.body).model, 'openrouter/free');
  assert.equal(called.options.headers.Authorization, 'Bearer test-key');
});
test('unconfigured, rate limited and malformed replies produce useful errors without leaking key', async () => {
  await assert.rejects(requestReply({ key: '', text: 'hi' }), /API Key/);
  await assert.rejects(requestReply({ key: 'secret-test', text: 'hi', fetchImpl: async () => new Response('secret-test', { status: 429 }) }), /次数|限流/);
  await assert.rejects(requestReply({ key: 'secret-test', text: 'hi', fetchImpl: async () => new Response('{}') }), /空回复|格式/);
});
test('cancelled requests terminate promptly', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestReply({ key: 'test-key', text: 'hi', signal: controller.signal, fetchImpl: async (_url, options) => { options.signal.throwIfAborted(); } }), /取消/);
});
