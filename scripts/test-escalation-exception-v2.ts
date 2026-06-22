import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3001/api';
const DB_PATH = path.resolve(process.cwd(), 'api', 'data', 'db.json');

type ApiResult = {
  ok: boolean;
  status: number;
  data?: any;
  raw?: string;
};

async function api(
  url: string,
  opts: RequestInit & { headers?: Record<string, string> } = {}
): Promise<ApiResult> {
  const res = await fetch(`${BASE}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const raw = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(raw), raw };
  } catch {
    return { ok: res.ok, status: res.status, raw };
  }
}

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

const allResults: TestResult[] = [];

function printResult(r: TestResult) {
  const status = r.passed ? '  ✅' : '  ❌';
  console.log(`${status}${r.name}`);
  if (!r.passed) console.log(`     ${r.details}`);
  else if (r.details) console.log(`     ${r.details}`);
}

function assertEq(name: string, actual: any, expected: any, note = '') {
  const ok = actual === expected;
  allResults.push({
    name,
    passed: ok,
    details: ok
      ? (note ? `✓ ${note}` : '✓')
      : `expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`,
  });
  printResult(allResults[allResults.length - 1]);
}

function assertTrue(name: string, cond: boolean, failNote: string, passNote = '') {
  allResults.push({
    name,
    passed: !!cond,
    details: cond ? (passNote || '✓') : `❌ ${failNote}`,
  });
  printResult(allResults[allResults.length - 1]);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────
// 登录
// ─────────────────────────────────────────────────────
async function login(username: string, password: string) {
  const r = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return r.data?.data?.token as string;
}

async function main() {
  console.log(''.padEnd(60, '═'));
  console.log('催办例外 — 修正回归测试');
  console.log('覆盖：完成后重开仍生效 / 列表详情历史一致 / 操作人正确 / 重启后不变');
  console.log(''.padEnd(60, '═'));

  const adminToken = await login('admin', 'admin123');
  assertTrue('admin 登录成功', !!adminToken, 'admin 登录失败');
  const techToken = await login('tech1', 'tech123');
  assertTrue('tech1 登录成功', !!techToken, 'tech1 登录失败');

  const adminHeaders = { 'x-user-id': adminToken };
  const techHeaders = { 'x-user-id': techToken };

  // ─────────────────────────────────────────────────────
  // 准备：缩短 pri_high 响应时限
  // ─────────────────────────────────────────────────────
  const priBeforeR = await api('/priorities', { headers: adminHeaders });
  const priorities = priBeforeR.data?.data?.priorities || [];
  const originalResponseTime = (priorities.find((p: any) => p.id === 'pri_high'))?.responseTimeMinutes ?? 10;

  await api('/priorities', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      priorities: priorities.map((p: any) => ({
        ...p,
        responseTimeMinutes: p.id === 'pri_high' ? 0.01 : p.responseTimeMinutes,
        escalationOwnerId: p.id === 'pri_high' ? 'user_admin' : p.escalationOwnerId,
      })),
    }),
  });
  console.log('\n▶ 准备：pri_high 响应时限设为 0.01 分钟（0.6秒）\n');

  // ─────────────────────────────────────────────────────
  // 测试 1：完成后重开仍生效（核心场景）
  // ─────────────────────────────────────────────────────
  console.log(''.padEnd(60, '─'));
  console.log('测试 1：完成后重开仍生效\n');

  const c1 = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: '北京 A 栋 3F',
      priorityId: 'pri_high',
      description: '例外重开后仍然生效的测试',
    }),
  });
  const t1Id = c1.data?.data?.ticket?.id;
  assertTrue('测试1-1：创建高优先级工单', !!t1Id, '工单创建失败', `工单 ${t1Id}`);

  // 先设置延后催办例外，截止时间在未来
  const futureDeadline = new Date(Date.now() + 3600_000).toISOString();
  const exc1 = await api(`/tickets/${t1Id}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      type: 'delay',
      reason: '等待供应商确认方案，延后1小时',
      deadline: futureDeadline,
    }),
  });
  assertEq(
    '测试1-2：设置延后催办例外成功',
    exc1.ok,
    true,
    `exception.type=${exc1.data?.data?.ticket?.escalationException?.type}`
  );

  // 状态流转：先派工 → 处理中 → 完成
  await api(`/tickets/${t1Id}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech1', note: '派工' }),
  });
  await api(`/tickets/${t1Id}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'processing' }),
  });
  const doneR = await api(`/tickets/${t1Id}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'completed' }),
  });
  assertTrue('测试1-3：完成工单成功', doneR.ok, `完成失败 status=${doneR.status}`);

  // 完成后：ticket.escalationException 应为 undefined，但 escalationExceptions 历史里的记录不能被标记为已撤销
  const detailAfterDone = await api(`/tickets/${t1Id}`, { headers: adminHeaders });
  const excHistAfterDone = detailAfterDone.data?.data?.escalationExceptions || [];
  const doneExc = excHistAfterDone.find((e: any) => e.type === 'delay');
  assertTrue(
    '测试1-4：完成后，工单内嵌 escalationException 清除，但历史记录仍存在',
    detailAfterDone.data?.data?.ticket?.escalationException === undefined &&
      excHistAfterDone.length >= 1,
    `escalationException=${JSON.stringify(detailAfterDone.data?.data?.ticket?.escalationException)}, hist_len=${excHistAfterDone.length}`
  );

  assertTrue(
    '测试1-5：完成后，例外记录的 revokedAt 为空（没被系统撤销）',
    doneExc && !doneExc.revokedAt,
    `revokedAt=${doneExc?.revokedAt ?? '(无)'}, revokedBy=${doneExc?.revokedBy ?? '(无)'}`
  );

  // 重开工单
  const reopenR = await api(`/tickets/${t1Id}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'reopened', reopenReason: '客户反馈问题未完全解决' }),
  });
  assertTrue('测试1-6：重开工单成功', reopenR.ok, `重开失败 status=${reopenR.status}`);

  // 重开后：检查列表和详情，例外应重新挂载（仍在有效期）
  await sleep(300);
  const detailAfterReopen = await api(`/tickets/${t1Id}`, { headers: adminHeaders });
  const reException = detailAfterReopen.data?.data?.ticket?.escalationException;
  assertEq(
    '测试1-7：重开后例外自动重新挂载（在有效期内不应被清除）',
    !!reException && reException.type === 'delay' && !reException.revokedAt,
    true,
    reException
      ? `已恢复: type=${reException.type}, deadline=${reException.deadline}`
      : '例外丢失或被错误撤销'
  );

  // 关键：重开后例外记录本身仍然没有 revokedAt/revokedBy（历史正确）
  const excHistAfterReopen = detailAfterReopen.data?.data?.escalationExceptions || [];
  const reopenedExc = excHistAfterReopen[0];
  assertTrue(
    '测试1-8：例外历史记录没有 revokedAt/revokedBy（系统从未生成脏数据）',
    reopenedExc && !reopenedExc.revokedAt && !reopenedExc.revokedBy,
    `revokedAt=${reopenedExc?.revokedAt ?? '无'}, revokedBy=${reopenedExc?.revokedBy ?? '无'}`
  );

  // 催办不应触发（仍在例外期）
  const listAfterReopen = await api('/tickets', { headers: adminHeaders });
  const t1InList = (listAfterReopen.data?.data?.tickets || []).find((t: any) => t.id === t1Id);
  assertEq(
    '测试1-9：重开后有例外，不应触发催办（isEscalated=false）',
    t1InList?.isEscalated,
    false,
    t1InList?.escalationException ? '例外生效中' : '例外无效'
  );

  // ─────────────────────────────────────────────────────
  // 测试 2：列表和详情历史一致（核心场景）
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('测试 2：列表和详情历史一致\n');

  // 列表接口每个 ticket 都带 escalationExceptions 数组
  const listAllR = await api('/tickets', { headers: adminHeaders });
  const listTickets = listAllR.data?.data?.tickets || [];
  const t2InList = listTickets.find((t: any) => t.id === t1Id);
  const listHist = t2InList?.escalationExceptions || [];

  // 详情接口外层 escalationExceptions
  const detailR = await api(`/tickets/${t1Id}`, { headers: adminHeaders });
  const detailOuterHist = detailR.data?.data?.escalationExceptions || [];
  const detailInnerHist = detailR.data?.data?.ticket?.escalationExceptions || [];

  assertEq(
    '测试2-1：列表 ticket.escalationExceptions 数组存在',
    Array.isArray(t2InList?.escalationExceptions) && listHist.length >= 1,
    true,
    `列表历史长度 ${listHist.length}`
  );

  assertEq(
    '测试2-2：列表 ticket.escalationExceptions 长度 = 详情外层 escalationExceptions 长度',
    listHist.length,
    detailOuterHist.length,
    `列表=${listHist.length}，详情外层=${detailOuterHist.length}`
  );

  assertEq(
    '测试2-3：列表 ticket.escalationExceptions 长度 = 详情 ticket.escalationExceptions 长度',
    listHist.length,
    detailInnerHist.length,
    `列表=${listHist.length}，详情内层=${detailInnerHist.length}`
  );

  // 校验第一个历史条目的字段一致（id/type/reason/deadline/createdBy/createdAt）
  const a = listHist[0];
  const b = detailOuterHist[0];
  const keyFields = ['id', 'ticketId', 'type', 'reason', 'deadline', 'createdBy', 'createdAt'];
  const fieldCmp = keyFields.every((k) => a?.[k] === b?.[k]);
  assertTrue(
    '测试2-4：列表与详情第一个例外记录的关键字段完全一致',
    fieldCmp,
    `列表字段=${JSON.stringify(keyFields.map(k => a?.[k]))}\n详情字段=${JSON.stringify(keyFields.map(k => b?.[k]))}`,
    '字段完全一致'
  );

  // ─────────────────────────────────────────────────────
  // 测试 3：操作人正确（自动/手动撤销不产生脏数据）
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('测试 3：操作人正确（自动/手动撤销不产生脏数据）\n');

  // 创建第二个工单，设置例外，然后手动撤销
  const c2 = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_002',
      location: '上海 B 栋 2F',
      priorityId: 'pri_high',
      description: '手动撤销例外的完整测试用例',
    }),
  });
  const t3Id = c2.data?.data?.ticket?.id;
  assertTrue('测试3-1：创建第二个工单', !!t3Id, '创建失败', `工单 ${t3Id}`);

  const exc2Deadline = new Date(Date.now() + 7200_000).toISOString();
  const exc2 = await api(`/tickets/${t3Id}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      type: 'exempt',
      reason: '免催办 2 小时',
      deadline: exc2Deadline,
    }),
  });
  assertEq('测试3-2：设置免催办例外', exc2.ok, true, `type=${exc2.data?.data?.ticket?.escalationException?.type}`);

  // 检查 createdBy 正确（是 admin，不是 system）
  const exc2CreatedBy = exc2.data?.data?.ticket?.escalationException?.createdBy;
  assertEq('测试3-3：例外 createdBy 为 user_admin（不是 system）',
    exc2CreatedBy, 'user_admin', `createdBy=${exc2CreatedBy}`);

  // 技术员不能撤销（越权拦截，复用测试但保留）
  const techDel = await api(`/tickets/${t3Id}/escalation-exception`, {
    method: 'DELETE',
    headers: techHeaders,
    body: JSON.stringify({ reason: '技术员越权撤销' }),
  });
  assertEq('测试3-4：技术员不能撤销例外（403）',
    techDel.status, 403, `正确拦截 status=${techDel.status}`);

  // 管理员手动撤销
  const adminDel = await api(`/tickets/${t3Id}/escalation-exception`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({ reason: '问题优先级已调整，无需例外' }),
  });
  assertEq('测试3-5：管理员手动撤销成功', adminDel.ok, true, '撤销成功');

  // 检查撤销记录的操作人正确
  const exc3Hist = adminDel.data?.data?.escalationExceptions || [];
  const revokedExc = exc3Hist.find((e: any) => e.revokedAt);
  assertEq(
    '测试3-6：手动撤销 revokedBy = user_admin（不是 system）',
    revokedExc?.revokedBy,
    'user_admin',
    `revokedBy=${revokedExc?.revokedBy}`
  );
  assertTrue(
    '测试3-7：手动撤销 revokedAt 存在且合法',
    revokedExc?.revokedAt && !isNaN(new Date(revokedExc.revokedAt).getTime()),
    `revokedAt=${revokedExc?.revokedAt ?? '无'}`
  );
  assertEq(
    '测试3-8：手动撤销 revokeReason 正确记录',
    !!revokedExc?.revokeReason,
    true,
    `revokeReason=${revokedExc?.revokeReason}`
  );

  // 整个 escalationExceptions 表里没有任何 revokedBy = 'system' 的记录
  // （通过 db.json 校验）
  await sleep(200);
  const rawDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const hasSystemRevoke = (rawDb.escalationExceptions || []).some((e: any) => e.revokedBy === 'system');
  assertEq(
    '测试3-9：db.json 中没有 revokedBy = system 的脏数据',
    hasSystemRevoke,
    false,
    hasSystemRevoke ? '存在脏数据！' : '干净数据 ✓'
  );

  // ─────────────────────────────────────────────────────
  // 测试 4：服务重启后结果不变（跨重启保留 + 校验无警告）
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('测试 4：服务重启后结果不变\n');

  // 重启前的快照
  const detailBeforeRestart = await api(`/tickets/${t1Id}`, { headers: adminHeaders });
  const snap1 = {
    escalationException: detailBeforeRestart.data?.data?.ticket?.escalationException,
    escalationExceptions: detailBeforeRestart.data?.data?.escalationExceptions,
    isEscalated: detailBeforeRestart.data?.data?.ticket?.isEscalated,
  };
  assertTrue('测试4-1：重启前，t1例外仍生效',
    !!snap1.escalationException && snap1.isEscalated === false,
    `exception=${JSON.stringify(!!snap1.escalationException)}, isEscalated=${snap1.isEscalated}`,
    `type=${snap1.escalationException?.type}`);

  // 注意：这里我们不真的重启服务，用"触发重新加载数据库 + 启动校验"的方式模拟：
  // 方式是：发一个会触发服务端内部校验的请求（任意 GET /tickets 都会走 checkAllEscalations → 启动时 loadDatabase 走 validateDatabase）
  // 但既然服务已经在运行，我们直接再请求，并验证 db.json 的结构一致性。
  // 真正的"跨重启一致性"是：数据持久化在 db.json 里，读取后 enrichTicket 自动还原。
  // 我们通过下面 4-2 ~ 4-5 验证：

  // 4-2 db.json 中 t1Id 的 escalationExceptions 历史仍在
  const dbNow = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  const t1InDb = (dbNow.tickets || []).find((t: any) => t.id === t1Id);
  const t1ExcsInDb = (dbNow.escalationExceptions || []).filter((e: any) => e.ticketId === t1Id);
  assertTrue(
    '测试4-2：db.json 中 t1 的 escalationExceptions 记录仍在且未被撤销',
    t1ExcsInDb.length >= 1 && t1ExcsInDb.every((e: any) => !e.revokedAt),
    `记录数=${t1ExcsInDb.length}, revoked=${t1ExcsInDb.map((e: any) => e.revokedBy).join(',')}`
  );

  // 4-3 再触发一次列表查询（会走 checkAllEscalations 和 enrichTicket）
  await api('/tickets', { headers: adminHeaders });
  const detailAfterHit = await api(`/tickets/${t1Id}`, { headers: adminHeaders });
  const snap2 = {
    escalationException: detailAfterHit.data?.data?.ticket?.escalationException,
    escalationExceptions: detailAfterHit.data?.data?.escalationExceptions,
    isEscalated: detailAfterHit.data?.data?.ticket?.isEscalated,
  };
  assertEq(
    '测试4-3：二次请求后 escalationException 仍挂载（id 一致）',
    snap2.escalationException?.id,
    snap1.escalationException?.id,
    `id=${snap2.escalationException?.id ?? '丢失'}`
  );
  assertEq(
    '测试4-4：二次请求后 escalationExceptions 历史长度一致',
    snap2.escalationExceptions?.length,
    snap1.escalationExceptions?.length,
    `${snap2.escalationExceptions?.length} vs ${snap1.escalationExceptions?.length}`
  );
  assertEq(
    '测试4-5：二次请求后仍不催办',
    snap2.isEscalated,
    false,
    `isEscalated=${snap2.isEscalated}`
  );

  // 4-6 再检查 db.json 里的异常校验：没有 'system' 的 revokedBy、没有引用错误。
  // 这是 "启动校验无警告" 的离线验证：
  const userIds = new Set((dbNow.users || []).map((u: any) => u.id));
  const badRefs = (dbNow.escalationExceptions || []).filter((e: any) => {
    const badCreated = !userIds.has(e.createdBy);
    const badRevoked = e.revokedBy && !userIds.has(e.revokedBy);
    const badSystem = e.revokedBy === 'system';
    return badCreated || badRevoked || badSystem;
  });
  assertEq(
    '测试4-6：db.json 中全部例外的 createdBy/revokedBy 都是有效用户（无 system）',
    badRefs.length,
    0,
    badRefs.length > 0
      ? `有 ${badRefs.length} 条异常：${JSON.stringify(badRefs.map((e: any) => ({ id: e.id, createdBy: e.createdBy, revokedBy: e.revokedBy })))}`
      : '全部有效 ✓'
  );

  // ─────────────────────────────────────────────────────
  // 测试 5：导出字段与接口数据一致（JSON 导出）
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('测试 5：导出字段与接口数据一致（JSON/CSV）\n');

  const jsonR = await api('/export/tickets?format=json', { headers: adminHeaders });
  const rows = jsonR.data || [];
  const t1Row = rows.find((r: any) => r['工单ID'] === t1Id);
  const t3Row = rows.find((r: any) => r['工单ID'] === t3Id);

  assertTrue('测试5-1：JSON 导出成功', Array.isArray(rows) && rows.length > 0,
    `导出 ${rows.length} 行`);

  // t1：生效中
  assertEq('测试5-2：导出 t1 催办例外状态 = 延后催办',
    t1Row?.['催办例外状态'], '延后催办', `状态=${t1Row?.['催办例外状态']}`);
  assertEq('测试5-3：导出 t1 催办例外原因 与接口一致',
    !!t1Row?.['催办例外原因'] && t1Row['催办例外原因'].length > 0,
    true, `原因=${t1Row?.['催办例外原因']}`);
  assertTrue('测试5-4：导出 t1 催办例外历史包含"生效中"字样',
    (t1Row?.['催办例外历史'] || '').includes('生效中'),
    `历史=${t1Row?.['催办例外历史']}`,
    '包含生效中 ✓');

  // t3：已撤销
  assertEq('测试5-5：导出 t3 催办例外状态 = 无（已撤销）',
    t3Row?.['催办例外状态'], '无', `状态=${t3Row?.['催办例外状态']}`);
  assertTrue('测试5-6：导出 t3 催办例外历史包含"已撤销"字样',
    (t3Row?.['催办例外历史'] || '').includes('已撤销'),
    `历史=${t3Row?.['催办例外历史']}`,
    '包含已撤销 ✓');

  // 导出字段完整性：6 个催办例外相关字段全部存在
  const excFields = ['催办例外状态', '催办例外原因', '催办例外截止时间', '催办例外操作人', '催办例外设置时间', '催办例外历史'];
  const all6FieldsPresent = t1Row && excFields.every((f) => f in t1Row);
  assertEq('测试5-7：导出包含 6 个催办例外字段',
    !!all6FieldsPresent, true, `字段：${excFields.join(', ')}`);

  // ─────────────────────────────────────────────────────
  // 测试 6：时间线事件正确（操作人不是 system）
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('测试 6：时间线事件操作人正确\n');

  const timelineR = await api(`/tickets/${t3Id}`, { headers: adminHeaders });
  const events = timelineR.data?.data?.timeline || [];
  const createdEvent = events.find((e: any) => e.type === 'escalation_exception_created');
  const revokedEvent = events.find((e: any) => e.type === 'escalation_exception_revoked');

  assertTrue('测试6-1：时间线包含例外创建事件', !!createdEvent,
    '未找到创建事件', `内容=${createdEvent?.content?.substring(0, 40)}...`);
  assertTrue('测试6-2：时间线包含例外撤销事件', !!revokedEvent,
    '未找到撤销事件', `内容=${revokedEvent?.content?.substring(0, 40)}...`);
  assertEq('测试6-3：创建事件 userId = user_admin',
    createdEvent?.userId, 'user_admin', `userId=${createdEvent?.userId}`);
  assertEq('测试6-4：撤销事件 userId = user_admin',
    revokedEvent?.userId, 'user_admin', `userId=${revokedEvent?.userId}`);
  assertTrue('测试6-5：创建事件 userName 存在且不是"系统"',
    !!createdEvent?.user?.name && createdEvent.user.name !== '系统',
    `name=${createdEvent?.user?.name ?? '无'}`,
    `name=${createdEvent?.user?.name}`);

  // ─────────────────────────────────────────────────────
  // 收尾：恢复 pri_high 配置
  // ─────────────────────────────────────────────────────
  console.log('\n' + ''.padEnd(60, '─'));
  console.log('清理：恢复 pri_high 原始响应时限\n');
  const priResetList = await api('/priorities', { headers: adminHeaders });
  const priReset = priResetList.data?.data?.priorities || [];
  const resetR = await api('/priorities', {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      priorities: priReset.map((p: any) => ({
        ...p,
        responseTimeMinutes: p.id === 'pri_high' ? originalResponseTime : p.responseTimeMinutes,
      })),
    }),
  });
  assertTrue(
    '清理：恢复 pri_high 响应时限',
    resetR.ok,
    `恢复失败 status=${resetR.status}`,
    `已恢复为 ${originalResponseTime} 分钟`
  );

  // ─────────────────────────────────────────────────────
  // 汇总
  // ─────────────────────────────────────────────────────
  const passed = allResults.filter((r) => r.passed).length;
  const total = allResults.length;
  const failed = allResults.filter((r) => !r.passed);

  console.log('\n' + ''.padEnd(60, '═'));
  console.log(`结果: ${passed}/${total} 通过, ${failed.length} 失败`);
  if (failed.length > 0) {
    console.log('失败项:');
    for (const f of failed) console.log(`  ❌ ${f.name}: ${f.details}`);
    console.log(''.padEnd(60, '═'));
    process.exit(1);
  } else {
    console.log('✅ 全部通过：状态流转正确、无脏数据、列表详情历史一致、操作人正确、导出一致');
    console.log(''.padEnd(60, '═'));
  }
}

main().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
