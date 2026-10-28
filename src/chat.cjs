'use strict';
const URL = 'https://openrouter.ai/api/v1/chat/completions';
const SYSTEM = '你是一位白发紫眼的成年龙娘桌面伙伴，温和自然，有一点慵懒和俏皮。用简短中文日常聊天，通常回复1到3句，最多150字。不输出动作控制命令。你没有读取用户屏幕、文件或实际感官的能力，不假装看到了。不要声称自己是OpenAI官方角色。';
function makeMessages(history = [], text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('先写一句想说的话吧。');
  if (text.length > 800) throw new Error('一次请发800字以内。');
  const clean = Array.isArray(history) ? history.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 1200) })) : [];
  return [{ role: 'system', content: SYSTEM }, ...clean, { role: 'user', content: text.trim() }];
}
async function requestReply({ key, text, history = [], signal, fetchImpl = fetch }) {
  if (!key) throw new Error('先在对话设置中填写 OpenRouter API Key。');
  const messages = makeMessages(history, text);
  try {
    const response = await fetchImpl(URL, {
      method: 'POST', signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Title': 'White Dragon Desktop Companion' },
      body: JSON.stringify({ model: 'openrouter/free', messages, max_tokens: 300, temperature: .8, stream: false })
    });
    if (!response.ok) {
      const error = { 401: 'API Key 无效，请在设置中重新填写。', 402: '服务暂不可用，请检查账号状态；桌宠不会切换付费模型。', 403: '服务拒绝访问，请检查账号或所在地区的可用性。', 429: '免费对话次数用完或暂时限流，稍后再试。' }[response.status] || '对话服务暂时没响应，稍后再试。';
      throw new Error(error);
    }
    let data;
    try { data = await response.json(); } catch { throw new Error('服务返回格式异常，请稍后重试。'); }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('服务返回了空回复，请稍后重试。');
    return answer.trim().slice(0, 1200);
  } catch (error) {
    if (signal?.aborted) throw new Error('已取消这次对话。');
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('等待超过30秒，请稍后再试。');
    if (error instanceof TypeError) throw new Error('连不上对话服务，请检查网络。');
    throw error;
  }
}
module.exports = { makeMessages, requestReply };
