const BASE = 'http://localhost:3001/api';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data, body: text };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== 催办逻辑调试 ===\n');

  // 1. 登录
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const token = loginRes.data?.data?.token;
  const headers = { 'x-user-id': token || '' };
  console.log(`1. 登录: ${loginRes.ok ? '✓' : '✗'}, token=${token?.slice(0, 10)}...`);

  // 2. 获取当前优先级配置
  const priRes = await api('/priorities', { headers });
  const priorities = priRes.data?.data?.priorities || [];
  const priHigh = priorities.find((p: any) => p.id === 'pri_high');
  console.log(`2. pri_high 配置: responseTimeMinutes=${priHigh?.responseTimeMinutes}, escalationOwnerId=${priHigh?.escalationOwnerId}`);

  // 3. 创建工单
  const createRes = await api('/tickets', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: '[DEBUG] 测试位置',
      description: '[DEBUG] 催办调试工单 ' + Date.now(),
      priorityId: 'pri_high',
    }),
  });
  const ticketId = createRes.data?.data?.ticket?.id;
  const createdAt = createRes.data?.data?.ticket?.createdAt;
  console.log(`3. 创建工单: id=${ticketId}, createdAt=${createdAt}`);

  // 4. 派工
  const assignRes = await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assigneeId: 'user_tech1', note: '调试派工' }),
  });
  const statusAfterAssign = assignRes.data?.data?.ticket?.status;
  console.log(`4. 派工: ok=${assignRes.ok}, status=${statusAfterAssign}`);

  // 5. 等待 2 秒（时限 0.01 分钟 = 0.6 秒）
  console.log(`5. 等待 2 秒让工单超时...`);
  await sleep(2000);

  // 6. 直接调用 checkAndTriggerEscalation（通过 GET /tickets）
  const now = Date.now();
  const createdTime = new Date(createdAt).getTime();
  const elapsedSec = (now - createdTime) / 1000;
  const elapsedMin = elapsedSec / 60;
  console.log(`6. 时间检查: 已过 ${elapsedSec.toFixed(2)} 秒 = ${elapsedMin.toFixed(4)} 分钟, 时限=${priHigh?.responseTimeMinutes} 分钟`);
  console.log(`   是否超时: ${elapsedMin >= priHigh?.responseTimeMinutes ? '是 ✓' : '否 ✗'}`);

  // 7. 调用列表接口触发催办
  const listRes = await api('/tickets', { headers });
  const tickets = listRes.data?.data?.tickets || [];
  const ticket = tickets.find((t: any) => t.id === ticketId);
  console.log(`7. 列表读取后: isEscalated=${ticket?.isEscalated}, escalatedAt=${ticket?.escalatedAt}`);

  if (ticket?.isEscalated) {
    console.log(`   ✓ 催办成功！催办时间: ${ticket.escalatedAt}`);
  } else {
    console.log(`   ✗ 催办未触发！`);
    // 尝试直接查详情看 escalationRecords
    const detailRes = await api(`/tickets/${ticketId}`, { headers });
    const escRecords = detailRes.data?.data?.escalationRecords || [];
    console.log(`   escalationRecords 数量: ${escRecords.length}`);
    escRecords.forEach((r: any, i: number) => {
      console.log(`   [${i}] priorityId=${r.priorityId}, escalatedAt=${r.escalatedAt}, deEscalatedAt=${r.deEscalatedAt}`);
    });
  }
}

main().catch(console.error);
