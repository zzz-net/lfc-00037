import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json');

const BASE = 'http://localhost:3001/api';
const TEST_PREFIX = '[ExceptionTest]';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

async function api(
  path: string,
  options: RequestInit = {},
  retries = 3
): Promise<{ ok: boolean; status: number; data: any; body: string }> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      return { ok: res.ok, status: res.status, data, body: text };
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return { ok: false, status: 0, data: null, body: String(lastError) };
}

function loadDb(): any {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function printResult(r: TestResult): void {
  console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
  if (r.details) console.log(`     ${r.details}`);
}

function futureDeadline(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60000);
  return d.toISOString();
}

async function setPriHighResponseTime(headers: Record<string, string>, minutes: number): Promise<boolean> {
  const priRes = await api('/priorities', { headers });
  const priorities = priRes.data?.data?.priorities || [];
  const updateRes = await api('/priorities', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      priorities: priorities.map((p: any) => ({
        ...p,
        responseTimeMinutes: p.id === 'pri_high' ? minutes : p.responseTimeMinutes,
        escalationOwnerId: p.id === 'pri_high' ? 'user_admin' : p.escalationOwnerId,
      })),
    }),
  });
  return updateRes.ok;
}

async function main() {
  const allResults: TestResult[] = [];

  console.log('═══════════════════════════════════════════════');
  console.log('  催办例外回归测试');
  console.log('═══════════════════════════════════════════════\n');

  // Login admin
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!adminLogin.ok) {
    console.log('❌ 无法登录 admin，终止测试');
    process.exit(1);
  }
  const adminToken = adminLogin.data?.data?.token;
  const adminHeaders = { 'x-user-id': adminToken || '' };
  console.log('✓ admin 登录成功\n');

  // Login technician
  const techLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'tech1', password: 'tech123' }),
  });
  if (!techLogin.ok) {
    console.log('❌ 无法登录 tech1，终止测试');
    process.exit(1);
  }
  const techToken = techLogin.data?.data?.token;
  const techHeaders = { 'x-user-id': techToken || '' };
  console.log('✓ tech1 登录成功\n');

  // Save original config
  const priRes0 = await api('/priorities', { headers: adminHeaders });
  const priorities0 = priRes0.data?.data?.priorities || [];
  const priHigh0 = priorities0.find((p: any) => p.id === 'pri_high');
  const originalPriHighResponseTime = priHigh0?.responseTimeMinutes ?? 120;

  // Prepare: set very short timeout
  console.log('▶ 准备：设置 pri_high 响应时限为 0.01 分钟（0.6秒）\n');
  const prepareOk = await setPriHighResponseTime(adminHeaders, 0.01);
  allResults.push({
    name: '准备：设置 pri_high 极短时限',
    passed: prepareOk,
    details: prepareOk ? '✓ 已设置' : '❌ 设置失败',
  });
  printResult(allResults[allResults.length - 1]);
  if (!prepareOk) {
    console.log('\n❌ 准备工作失败，终止测试');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────
  // 测试 1：创建催办例外 - delay 类型
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 1：创建延后催办例外并验证\n');

  const createRes = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: `${TEST_PREFIX} 测试位置`,
      description: `${TEST_PREFIX} 催办例外测试工单 ${Date.now()}`,
      priorityId: 'pri_high',
    }),
  });
  const ticketId = createRes.data?.data?.ticket?.id;
  allResults.push({
    name: '测试1-1：创建测试工单',
    passed: createRes.ok && !!ticketId,
    details: createRes.ok ? `✓ 工单 ${ticketId}` : `❌ ${createRes.data?.error}`,
  });
  printResult(allResults[allResults.length - 1]);
  if (!ticketId) { console.log('\n❌ 创建工单失败'); process.exit(1); }

  // Assign
  await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech1' }),
  });

  // Wait for escalation
  await new Promise(r => setTimeout(r, 1500));

  // Trigger escalation check
  await api('/tickets', { headers: adminHeaders });

  // Check escalation happened
  const detail1 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const isEscalated1 = detail1.data?.data?.ticket?.isEscalated;
  allResults.push({
    name: '测试1-2：工单超时后自动催办',
    passed: isEscalated1 === true,
    details: isEscalated1 ? '✓ 已催办' : `❌ isEscalated=${isEscalated1}`,
  });
  printResult(allResults[allResults.length - 1]);

  // Create delay exception - should auto-de-escalate
  const deadline = futureDeadline(60);
  const excCreateRes = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'delay', reason: '等待供应商确认', deadline }),
  });
  const hasException = excCreateRes.data?.data?.ticket?.escalationException;
  const isEscalatedAfter = excCreateRes.data?.data?.ticket?.isEscalated;
  allResults.push({
    name: '测试1-3：设置延后催办例外（自动撤销催办）',
    passed: excCreateRes.ok && hasException && isEscalatedAfter === false,
    details: excCreateRes.ok
      ? `✓ 例外已设置，催办已自动撤销, exception.type=${hasException?.type}`
      : `❌ ${excCreateRes.data?.error}`,
  });
  printResult(allResults[allResults.length - 1]);

  // Verify escalation doesn't re-trigger with exception
  await new Promise(r => setTimeout(r, 1500));
  const listRes2 = await api('/tickets', { headers: adminHeaders });
  const ticketAfterList2 = listRes2.data?.data?.tickets?.find((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试1-4：有例外时，读取列表不会复发催办',
    passed: listRes2.ok && ticketAfterList2?.isEscalated === false && !!ticketAfterList2?.escalationException,
    details: !ticketAfterList2?.isEscalated ? '✓ 未复发，例外生效中' : '❌ 例外无效，催办复发',
  });
  printResult(allResults[allResults.length - 1]);

  // Verify timeline has exception_created event
  const detail2 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const timeline2 = detail2.data?.data?.timeline || [];
  const hasExceptionCreated = timeline2.some((e: any) => e.type === 'escalation_exception_created');
  allResults.push({
    name: '测试1-5：时间线包含 escalation_exception_created 事件',
    passed: hasExceptionCreated,
    details: hasExceptionCreated ? '✓ 时间线有设置例外事件' : '❌ 缺少例外创建事件',
  });
  printResult(allResults[allResults.length - 1]);

  // Verify escalationExceptions list in detail
  const excList2 = detail2.data?.data?.escalationExceptions || [];
  allResults.push({
    name: '测试1-6：详情返回 escalationExceptions 列表',
    passed: excList2.length >= 1 && excList2[0].type === 'delay' && excList2[0].reason === '等待供应商确认',
    details: excList2.length >= 1 ? `✓ 有 ${excList2.length} 条例外记录, type=${excList2[0].type}` : '❌ 缺少例外记录',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 2：越权拦截 - 非 admin 不能设置/撤销例外
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 2：越权拦截\n');

  const excTechCreate = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'POST',
    headers: techHeaders,
    body: JSON.stringify({ type: 'exempt', reason: '技术员尝试设置', deadline: futureDeadline(30) }),
  });
  allResults.push({
    name: '测试2-1：技术员不能设置催办例外（403）',
    passed: excTechCreate.status === 403,
    details: excTechCreate.status === 403 ? '✓ 正确拦截' : `❌ 状态码=${excTechCreate.status}`,
  });
  printResult(allResults[allResults.length - 1]);

  const excTechDelete = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'DELETE',
    headers: techHeaders,
    body: JSON.stringify({ reason: '技术员尝试撤销' }),
  });
  allResults.push({
    name: '测试2-2：技术员不能撤销催办例外（403）',
    passed: excTechDelete.status === 403,
    details: excTechDelete.status === 403 ? '✓ 正确拦截' : `❌ 状态码=${excTechDelete.status}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 3：撤销例外后重新催办
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 3：撤销例外后重新计算催办\n');

  const revokeExcRes = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({ reason: '供应商已确认，恢复催办' }),
  });
  allResults.push({
    name: '测试3-1：管理员撤销催办例外',
    passed: revokeExcRes.ok && !revokeExcRes.data?.data?.ticket?.escalationException,
    details: revokeExcRes.ok ? '✓ 例外已撤销' : `❌ ${revokeExcRes.data?.error}`,
  });
  printResult(allResults[allResults.length - 1]);

  // Wait and check escalation re-triggers
  await new Promise(r => setTimeout(r, 1500));
  const listRes3 = await api('/tickets', { headers: adminHeaders });
  const ticketAfterList3 = listRes3.data?.data?.tickets?.find((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试3-2：撤销例外后，催办重新触发',
    passed: listRes3.ok && ticketAfterList3?.isEscalated === true,
    details: ticketAfterList3?.isEscalated ? '✓ 催办已重新触发' : `❌ isEscalated=${ticketAfterList3?.isEscalated}`,
  });
  printResult(allResults[allResults.length - 1]);

  // Verify timeline has exception_revoked event
  const detail3 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const timeline3 = detail3.data?.data?.timeline || [];
  const hasExceptionRevoked = timeline3.some((e: any) => e.type === 'escalation_exception_revoked');
  allResults.push({
    name: '测试3-3：时间线包含 escalation_exception_revoked 事件',
    passed: hasExceptionRevoked,
    details: hasExceptionRevoked ? '✓ 时间线有撤销例外事件' : '❌ 缺少例外撤销事件',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 4：exempt 类型的例外
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 4：免催办例外\n');

  // First de-escalate the ticket
  await api(`/tickets/${ticketId}/de-escalate`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ reason: '测试免催办例外前先撤销催办' }),
  });

  const exemptRes = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'exempt', reason: '配件需要定制，暂时无法处理', deadline: futureDeadline(120) }),
  });
  allResults.push({
    name: '测试4-1：设置免催办例外',
    passed: exemptRes.ok && exemptRes.data?.data?.ticket?.escalationException?.type === 'exempt',
    details: exemptRes.ok ? '✓ 免催办例外已设置' : `❌ ${exemptRes.data?.error}`,
  });
  printResult(allResults[allResults.length - 1]);

  // Check escalation doesn't trigger with exempt
  await new Promise(r => setTimeout(r, 1500));
  const listRes4 = await api('/tickets', { headers: adminHeaders });
  const ticketAfterList4 = listRes4.data?.data?.tickets?.find((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试4-2：免催办例外生效，催办不触发',
    passed: listRes4.ok && ticketAfterList4?.isEscalated === false && ticketAfterList4?.escalationException?.type === 'exempt',
    details: !ticketAfterList4?.isEscalated ? '✓ 免催办生效' : '❌ 例外无效',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 5：校验 - 不允许重复设置、必填字段
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 5：校验规则\n');

  const dupExcRes = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'delay', reason: '尝试重复设置', deadline: futureDeadline(60) }),
  });
  allResults.push({
    name: '测试5-1：不允许重复设置例外',
    passed: !dupExcRes.ok && dupExcRes.data?.error?.includes('已有生效中'),
    details: !dupExcRes.ok ? `✓ 正确拦截：${dupExcRes.data?.error}` : '❌ 允许了重复设置',
  });
  printResult(allResults[allResults.length - 1]);

  const noReasonRes = await api(`/tickets/${ticketId}/escalation-exception`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  // Since there IS an exception, we need to check that empty reason is rejected
  // But the delete needs a reason. Let's test with a new ticket.
  const createRes5 = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: `${TEST_PREFIX} 校验测试`,
      description: `${TEST_PREFIX} 校验测试工单`,
      priorityId: 'pri_high',
    }),
  });
  const ticketId5 = createRes5.data?.data?.ticket?.id;

  const noReasonExcRes = await api(`/tickets/${ticketId5}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'delay', deadline: futureDeadline(30) }),
  });
  allResults.push({
    name: '测试5-2：缺少原因时拒绝设置',
    passed: !noReasonExcRes.ok,
    details: !noReasonExcRes.ok ? `✓ 正确拦截：${noReasonExcRes.data?.error}` : '❌ 缺少原因仍成功',
  });
  printResult(allResults[allResults.length - 1]);

  const noDeadlineRes = await api(`/tickets/${ticketId5}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'delay', reason: '测试缺少截止时间' }),
  });
  allResults.push({
    name: '测试5-3：缺少截止时间时拒绝设置',
    passed: !noDeadlineRes.ok,
    details: !noDeadlineRes.ok ? `✓ 正确拦截：${noDeadlineRes.data?.error}` : '❌ 缺少截止时间仍成功',
  });
  printResult(allResults[allResults.length - 1]);

  const pastDeadlineRes = await api(`/tickets/${ticketId5}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'delay', reason: '测试过去截止时间', deadline: new Date(Date.now() - 3600000).toISOString() }),
  });
  allResults.push({
    name: '测试5-4：截止时间在过去时拒绝设置',
    passed: !pastDeadlineRes.ok,
    details: !pastDeadlineRes.ok ? `✓ 正确拦截：${pastDeadlineRes.data?.error}` : '❌ 过去截止时间仍成功',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 6：完成/重开后，有效期内的例外不被撤销，重开后自动恢复
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 6：完成/重开后，有效期内例外自动恢复（新语义）\n');

  // Complete the ticket with exception
  const completeRes6 = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'completed', note: '完成测试' }),
  });
  const afterComplete = completeRes6.data?.data?.ticket;
  allResults.push({
    name: '测试6-1：完成后，工单内嵌 escalationException 清除',
    passed: completeRes6.ok && !afterComplete?.escalationException,
    details: !afterComplete?.escalationException ? '✓ 已清除完成态缓存引用' : '❌ 未清除',
  });
  printResult(allResults[allResults.length - 1]);

  // Verify in db.json exception NOT revoked (still effective record, only state cleared)
  const dbAfter6Complete = loadDb();
  const excInDb6Complete = dbAfter6Complete.escalationExceptions?.filter(
    (e: any) => e.ticketId === ticketId
  );
  const stillActive = excInDb6Complete?.filter((e: any) => !e.revokedAt && new Date(e.deadline).getTime() > Date.now());
  allResults.push({
    name: '测试6-2：db.json 中例外记录仍未被撤销（保留有效历史）',
    passed: stillActive && stillActive.length > 0,
    details: stillActive && stillActive.length > 0
      ? `✓ 保留 ${stillActive.length} 条未撤销记录`
      : '❌ 被错误撤销或丢失',
  });
  printResult(allResults[allResults.length - 1]);

  // Reopen — exception should auto-restore
  const reopenRes6 = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'reopened', reopenReason: '测试重开后例外恢复' }),
  });
  const ticketAfterReopen = reopenRes6.data?.data?.ticket;
  allResults.push({
    name: '测试6-3：重开后有效例外自动重新挂载（新行为）',
    passed: reopenRes6.ok && !!ticketAfterReopen?.escalationException,
    details: ticketAfterReopen?.escalationException
      ? `✓ 已恢复 type=${ticketAfterReopen.escalationException.type}`
      : '❌ 例外丢失未恢复',
  });
  printResult(allResults[allResults.length - 1]);

  // And the exception record still has no revokedAt/revokedBy
  const dbAfter6Reopen = loadDb();
  const noRevokedBySystem = !(dbAfter6Reopen.escalationExceptions || []).some(
    (e: any) => e.ticketId === ticketId && (e.revokedBy === 'system' || (e.revokedAt && e.revokedBy === undefined))
  );
  allResults.push({
    name: '测试6-4：db.json 中无 revokedBy=system 脏数据',
    passed: noRevokedBySystem,
    details: noRevokedBySystem ? '✓ 干净数据' : '❌ 存在脏数据',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 7：跨重启保留
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 7：跨重启保留（db.json 校验）\n');

  // Create a new ticket, set exception
  const createRes7 = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_002',
      location: `${TEST_PREFIX} 跨重启测试`,
      description: `${TEST_PREFIX} 跨重启保留测试工单`,
      priorityId: 'pri_high',
    }),
  });
  const ticketId7 = createRes7.data?.data?.ticket?.id;

  await api(`/tickets/${ticketId7}/escalation-exception`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'exempt', reason: '跨重启保留测试', deadline: futureDeadline(1440) }),
  });

  const dbAfter7 = loadDb();
  const ticketInDb7 = dbAfter7.tickets.find((t: any) => t.id === ticketId7);
  const excInDb7 = dbAfter7.escalationExceptions?.find((e: any) => e.ticketId === ticketId7 && !e.revokedAt);

  allResults.push({
    name: '测试7-1：db.json 中工单有 escalationException 字段',
    passed: !!ticketInDb7?.escalationException,
    details: ticketInDb7?.escalationException ? `✓ exception.type=${ticketInDb7.escalationException.type}` : '❌ 工单缺少 escalationException',
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试7-2：db.json 中 escalationExceptions 表有对应记录',
    passed: !!excInDb7 && excInDb7.type === 'exempt' && excInDb7.reason === '跨重启保留测试',
    details: excInDb7 ? `✓ 记录存在: type=${excInDb7.type}, reason=${excInDb7.reason}` : '❌ 缺少例外记录',
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试7-3：db.json 中例外记录有完整的 createdBy/createdAt/deadline',
    passed: !!excInDb7?.createdBy && !!excInDb7?.createdAt && !!excInDb7?.deadline,
    details: excInDb7?.createdBy ? `✓ createdBy=${excInDb7.createdBy}, 有createdAt和deadline` : '❌ 字段不完整',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 8：导出字段一致性
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 8：导出字段一致性\n');

  const exportJsonRes = await api('/export/tickets?format=json', { headers: adminHeaders });
  let jsonHasExceptionFields = false;
  let jsonExceptionData = false;
  try {
    const jsonData = JSON.parse(exportJsonRes.body);
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const keys = Object.keys(jsonData[0]);
      jsonHasExceptionFields = keys.includes('催办例外状态') && keys.includes('催办例外原因') && keys.includes('催办例外截止时间') && keys.includes('催办例外操作人') && keys.includes('催办例外设置时间') && keys.includes('催办例外历史');
      const ticketWithException = jsonData.find((r: any) => r['催办例外状态'] !== '无' && r['催办例外状态'] !== '');
      jsonExceptionData = !!ticketWithException;
    }
  } catch {}
  allResults.push({
    name: '测试8-1：JSON 导出包含 6 个催办例外字段',
    passed: exportJsonRes.ok && jsonHasExceptionFields,
    details: jsonHasExceptionFields ? '✓ 包含催办例外状态/原因/截止时间/操作人/设置时间/历史' : '❌ 缺少例外字段',
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试8-2：JSON 导出数据包含催办例外内容',
    passed: exportJsonRes.ok && jsonExceptionData,
    details: jsonExceptionData ? '✓ 导出数据中有例外内容' : '❌ 导出数据中无例外内容',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 9：列表筛选 hasException
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 9：列表筛选 hasException\n');

  const filterYesRes = await api('/tickets?hasException=yes', { headers: adminHeaders });
  const allYes = filterYesRes.data?.data?.tickets || [];
  const allHaveException = allYes.every((t: any) => t.escalationException);

  const filterNoRes = await api('/tickets?hasException=no', { headers: adminHeaders });
  const allNo = filterNoRes.data?.data?.tickets || [];
  const allNoException = allNo.every((t: any) => !t.escalationException);

  allResults.push({
    name: '测试9-1：hasException=yes 筛选结果都有例外',
    passed: filterYesRes.ok && allHaveException && allYes.length > 0,
    details: allHaveException && allYes.length > 0 ? `✓ ${allYes.length} 条有例外` : `❌ allHaveException=${allHaveException}, count=${allYes.length}`,
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试9-2：hasException=no 筛选结果都无例外',
    passed: filterNoRes.ok && allNoException && allNo.length > 0,
    details: allNoException && allNo.length > 0 ? `✓ ${allNo.length} 条无例外` : `❌ allNoException=${allNoException}, count=${allNo.length}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 10：前端-后端一致性（API 返回字段与前端显示所需一致）
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 10：前端-后端字段一致性\n');

  const detail10 = await api(`/tickets/${ticketId7}`, { headers: adminHeaders });
  const ticket10 = detail10.data?.data?.ticket;
  const exc10 = ticket10?.escalationException;
  allResults.push({
    name: '测试10-1：ticket.escalationException 包含完整字段',
    passed: !!exc10 && !!exc10.id && !!exc10.type && !!exc10.reason && !!exc10.deadline && !!exc10.createdBy && !!exc10.createdAt,
    details: exc10 ? `✓ id/type/reason/deadline/createdBy/createdAt 都有` : '❌ 缺少 escalationException',
  });
  printResult(allResults[allResults.length - 1]);

  const excList10 = detail10.data?.data?.escalationExceptions || [];
  const exc10history = excList10.find((e: any) => e.ticketId === ticketId7);
  allResults.push({
    name: '测试10-2：escalationExceptions 列表包含完整历史记录',
    passed: excList10.length >= 1 && !!exc10history,
    details: excList10.length >= 1 ? `✓ 有 ${excList10.length} 条记录` : '❌ 缺少例外历史记录',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 清理
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 清理：恢复 pri_high 原始配置\n');
  const restoreOk = await setPriHighResponseTime(adminHeaders, originalPriHighResponseTime);
  allResults.push({
    name: '清理：恢复 pri_high 原始响应时限',
    passed: restoreOk,
    details: restoreOk ? `✓ 已恢复为 ${originalPriHighResponseTime} 分钟` : '❌ 恢复失败',
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 结果汇总
  // ─────────────────────────────────────────────────────
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  const total = allResults.length;

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  结果: ${passed}/${total} 通过, ${failed} 失败`);
  if (failed > 0) {
    console.log('  失败项:');
    allResults.filter((r) => !r.passed).forEach((r) => console.log(`    ❌ ${r.name}: ${r.details || ''}`));
  } else {
    console.log('  ✅ 全部通过！催办例外功能正常：创建/撤销/越权拦截/跨重启保留/导出一致/重开清除/筛选一致。');
  }
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
