import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json');

const BASE = 'http://localhost:3001/api';
const TEST_PREFIX = '[EscalationFix]';
const VERY_SHORT_TIMEOUT = 0.01; // 0.01 分钟 = 0.6 秒，用于快速触发催办

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

function saveDb(db: any): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function printResult(r: TestResult): void {
  console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
  if (r.details) console.log(`     ${r.details}`);
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
  const createdTicketIds: string[] = [];

  console.log('═══════════════════════════════════════════════');
  console.log('  催办撤销回归测试 - 修复验证');
  console.log('═══════════════════════════════════════════════\n');

  // 登录
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

  // 保存原始配置
  const priRes0 = await api('/priorities', { headers: adminHeaders });
  const priorities0 = priRes0.data?.data?.priorities || [];
  const priHigh0 = priorities0.find((p: any) => p.id === 'pri_high');
  const originalPriHighResponseTime = priHigh0?.responseTimeMinutes ?? 120;
  console.log(`  原始 pri_high 响应时限: ${originalPriHighResponseTime} 分钟\n`);

  // ─────────────────────────────────────────────────────
  // 准备：把 pri_high 设为极短时限 0.01 分钟（0.6 秒）
  // ─────────────────────────────────────────────────────
  console.log('▶ 准备：设置 pri_high 响应时限为 0.01 分钟（0.6秒）\n');
  const prepareOk = await setPriHighResponseTime(adminHeaders, VERY_SHORT_TIMEOUT);
  allResults.push({
    name: '准备：设置 pri_high 极短时限',
    passed: prepareOk,
    details: prepareOk ? '✓ 已设置 pri_high.responseTimeMinutes=0.01' : '❌ 设置失败',
  });
  printResult(allResults[allResults.length - 1]);
  if (!prepareOk) {
    console.log('\n❌ 准备工作失败，终止测试');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────
  // 测试 1：创建工单 → 等待超时催办 → 撤销催办 → 多次读取不复发
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 1：撤销催办后，列表/详情读取不复发\n');

  // 创建工单
  const createRes = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: `${TEST_PREFIX} 测试位置`,
      description: `${TEST_PREFIX} 这是催办撤销回归测试工单 ${Date.now()}`,
      priorityId: 'pri_high',
    }),
  });
  const ticketId = createRes.data?.data?.ticket?.id;
  createdTicketIds.push(ticketId);
  allResults.push({
    name: '测试1-1：创建测试工单（pri_high，0.6秒时限）',
    passed: createRes.ok && !!ticketId,
    details: createRes.ok ? `✓ 工单 ${ticketId} 已创建` : `❌ ${createRes.data?.error || createRes.body}`,
  });
  printResult(allResults[allResults.length - 1]);
  if (!ticketId) {
    console.log('\n❌ 创建工单失败，终止测试');
    process.exit(1);
  }

  // 派工给技术员，状态从 pending → processing
  const assignRes = await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech1', note: `${TEST_PREFIX} 测试派工` }),
  });
  allResults.push({
    name: '测试1-1b：派工给技术员（pending→processing）',
    passed: assignRes.ok && assignRes.data?.data?.ticket?.status === 'processing',
    details: assignRes.ok ? '✓ 已派工，状态=processing' : `❌ ${assignRes.data?.error || assignRes.body}`,
  });
  printResult(allResults[allResults.length - 1]);
  if (!assignRes.ok) {
    console.log('\n❌ 派工失败，终止测试');
    process.exit(1);
  }

  // 等待 2.5 秒，确保超时（0.6 秒时限）
  console.log('  等待 2.5 秒让工单超时...');
  await new Promise((r) => setTimeout(r, 2500));

  // 调用 GET /tickets 触发 checkAllEscalations，应该触发催办
  const listRes1 = await api('/tickets', { headers: adminHeaders });
  const ticketAfterList1 = listRes1.data?.data?.tickets?.find((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试1-2：读取列表触发催办（超时0.6秒，isEscalated=true）',
    passed: listRes1.ok && ticketAfterList1?.isEscalated === true,
    details: ticketAfterList1?.isEscalated
      ? `✓ 工单已自动进入催办，催办时间=${ticketAfterList1.escalatedAt?.slice(11, 19)}`
      : `❌ 催办未触发，isEscalated=${ticketAfterList1?.isEscalated}, listOk=${listRes1.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 调用详情接口，确认 escalationRecords 有记录
  const detailRes1 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const escRecords1 = detailRes1.data?.data?.escalationRecords || [];
  allResults.push({
    name: '测试1-3：详情页返回 escalationRecords 催办记录',
    passed: detailRes1.ok && escRecords1.length >= 1 && typeof escRecords1[0].responseTimeMinutesAtTrigger === 'number',
    details: escRecords1.length >= 1
      ? `✓ 有 ${escRecords1.length} 条催办记录，responseTimeMinutesAtTrigger=${escRecords1[0].responseTimeMinutesAtTrigger}`
      : `❌ 缺少催办记录，detailOk=${detailRes1.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 管理员撤销催办
  const deEscalateRes = await api(`/tickets/${ticketId}/de-escalate`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ reason: '测试撤销催办，验证不复发' }),
  });
  allResults.push({
    name: '测试1-4：管理员撤销催办',
    passed: deEscalateRes.ok && deEscalateRes.data?.data?.ticket?.isEscalated === false,
    details: deEscalateRes.ok
      ? `✓ 撤销成功，isEscalated=false`
      : `❌ ${deEscalateRes.data?.error || deEscalateRes.body || deEscalateRes.status}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 关键！连续 3 次调用 GET /tickets 和 GET /tickets/:id，验证不复发
  let relapse = false;
  let relapseDetails = '';
  for (let i = 1; i <= 3; i++) {
    const listRes = await api('/tickets', { headers: adminHeaders });
    const t = listRes.data?.data?.tickets?.find((t: any) => t.id === ticketId);
    if (!listRes.ok) {
      relapse = true;
      relapseDetails = `❌ 第 ${i} 次列表读取失败：${listRes.body}`;
      break;
    }
    if (t?.isEscalated) {
      relapse = true;
      relapseDetails = `❌ 第 ${i} 次列表读取复发！isEscalated=true`;
      break;
    }
    const detailRes = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
    if (!detailRes.ok) {
      relapse = true;
      relapseDetails = `❌ 第 ${i} 次详情读取失败：${detailRes.body}`;
      break;
    }
    const t2 = detailRes.data?.data?.ticket;
    if (t2?.isEscalated) {
      relapse = true;
      relapseDetails = `❌ 第 ${i} 次详情读取复发！isEscalated=true`;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  allResults.push({
    name: '测试1-5：连续 3 次读取列表+详情，撤销状态稳定（不复发）',
    passed: !relapse,
    details: !relapse ? '✓ 3 次读取均保持 isEscalated=false，未复发' : relapseDetails,
  });
  printResult(allResults[allResults.length - 1]);

  // 验证「未催办」筛选也能过滤到它
  const filterNoRes = await api('/tickets?isEscalated=no', { headers: adminHeaders });
  const allTicketsNo = filterNoRes.data?.data?.tickets || [];
  const inNoFilter = allTicketsNo.some((t: any) => t.id === ticketId);
  const filterYesRes = await api('/tickets?isEscalated=yes', { headers: adminHeaders });
  const allTicketsYes = filterYesRes.data?.data?.tickets || [];
  const inYesFilter = allTicketsYes.some((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试1-6：筛选状态一致（isEscalated=no 能找到，yes 找不到）',
    passed: filterNoRes.ok && filterYesRes.ok && inNoFilter && !inYesFilter,
    details: filterNoRes.ok && filterYesRes.ok && inNoFilter && !inYesFilter
      ? '✓ 筛选结果与催办状态一致'
      : `❌ noFilterOk=${filterNoRes.ok}, yesFilterOk=${filterYesRes.ok}, inNo=${inNoFilter}, inYes=${inYesFilter}，不一致`,
  });
  printResult(allResults[allResults.length - 1]);

  // 验证时间线有 de_escalated 事件
  const detailRes2 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const timeline2 = detailRes2.data?.data?.timeline || [];
  const hasDeEscalatedEvent = timeline2.some((e: any) => e.type === 'de_escalated');
  allResults.push({
    name: '测试1-7：时间线包含 de_escalated 事件',
    passed: detailRes2.ok && hasDeEscalatedEvent,
    details: hasDeEscalatedEvent ? '✓ 时间线有撤销催办记录' : `❌ 缺少 de_escalated 事件，detailOk=${detailRes2.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 验证 escalationRecords 有 deEscalatedAt/By/Reason
  const escRecords2 = detailRes2.data?.data?.escalationRecords || [];
  const hasDeEscalatedRecord = escRecords2.some(
    (r: any) => r.deEscalatedAt && r.deEscalatedBy && r.deEscalationReason
  );
  allResults.push({
    name: '测试1-8：escalationRecords 包含完整撤销信息',
    passed: detailRes2.ok && hasDeEscalatedRecord,
    details: hasDeEscalatedRecord
      ? '✓ 催办记录有 deEscalatedAt/By/Reason'
      : `❌ 缺少撤销信息，detailOk=${detailRes2.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 2：服务重启（模拟：直接读 db.json 校验持久化）
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 2：跨重启状态保持\n');

  const dbAfter = loadDb();
  const ticketInDb = dbAfter.tickets.find((t: any) => t.id === ticketId);
  const escRecordInDb = dbAfter.escalationRecords.find((r: any) => r.ticketId === ticketId && r.deEscalatedAt);
  allResults.push({
    name: '测试2-1：db.json 中 isEscalated=false（持久化正确）',
    passed: ticketInDb?.isEscalated === false || ticketInDb?.isEscalated === undefined,
    details: ticketInDb?.isEscalated ? `❌ db.json 中 isEscalated=${ticketInDb?.isEscalated}` : '✓ db.json 中 isEscalated=false',
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试2-2：db.json 中 escalationRecords 有撤销信息（持久化正确）',
    passed: !!escRecordInDb,
    details: escRecordInDb
      ? `✓ 催办记录已持久化，撤销时间=${escRecordInDb.deEscalatedAt?.slice(11, 19)}`
      : '❌ db.json 中缺少带撤销信息的催办记录',
  });
  printResult(allResults[allResults.length - 1]);

  allResults.push({
    name: '测试2-3：db.json 中 escalationRecords.responseTimeMinutesAtTrigger 已持久化',
    passed: typeof escRecordInDb?.responseTimeMinutesAtTrigger === 'number',
    details: typeof escRecordInDb?.responseTimeMinutesAtTrigger === 'number'
      ? `✓ responseTimeMinutesAtTrigger=${escRecordInDb.responseTimeMinutesAtTrigger} 已持久化`
      : `❌ responseTimeMinutesAtTrigger=${escRecordInDb?.responseTimeMinutesAtTrigger}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 3：完成→重开后，超时会重新催办
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 3：完成→重开后，超时会重新催办\n');

  // 先把工单完成
  const completeRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'completed', note: `${TEST_PREFIX} 完成以测试重开` }),
  });
  allResults.push({
    name: '测试3-1：完成工单',
    passed: completeRes.ok && completeRes.data?.data?.ticket?.status === 'completed',
    details: completeRes.ok ? '✓ 工单已完成' : `❌ ${completeRes.data?.error || completeRes.body}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 验证完成时自动清掉催办标记
  const completedTicket = completeRes.data?.data?.ticket;
  allResults.push({
    name: '测试3-2：完成工单自动清催办标记',
    passed: completeRes.ok && (completedTicket?.isEscalated === false || completedTicket?.isEscalated === undefined),
    details: completedTicket?.isEscalated ? `❌ 已完成工单仍有催办标记` : '✓ 已完成工单无催办标记',
  });
  printResult(allResults[allResults.length - 1]);

  // 重新打开
  const reopenRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'reopened', reopenReason: `${TEST_PREFIX} 测试重开后重新催办` }),
  });
  allResults.push({
    name: '测试3-3：管理员重新打开工单',
    passed: reopenRes.ok && reopenRes.data?.data?.ticket?.status === 'reopened',
    details: reopenRes.ok ? '✓ 工单已重新打开' : `❌ ${reopenRes.data?.error || reopenRes.body}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 派工给技术员（reopened 状态需要派工才能进入 processing）
  const assignAfterReopenRes = await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech1', note: `${TEST_PREFIX} 重开后派工` }),
  });
  allResults.push({
    name: '测试3-3b：重开后派工给技术员',
    passed: assignAfterReopenRes.ok && assignAfterReopenRes.data?.data?.ticket?.status === 'processing',
    details: assignAfterReopenRes.ok ? '✓ 已派工，状态=processing' : `❌ ${assignAfterReopenRes.data?.error || assignAfterReopenRes.body}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 等待 2 秒，确保超时（时限 0.6 秒）
  console.log('  等待 2 秒让重开工单超时...');
  await new Promise((r) => setTimeout(r, 2000));

  // 调用 GET /tickets 触发 checkAllEscalations，应该重新催办（因为有 reopened 事件在 deEscalatedAt 之后）
  const listRes2 = await api('/tickets', { headers: adminHeaders });
  const ticketAfterList2 = listRes2.data?.data?.tickets?.find((t: any) => t.id === ticketId);
  allResults.push({
    name: '测试3-4：重开后重新读取 → 再次进入催办（满足重新触发条件）',
    passed: listRes2.ok && ticketAfterList2?.isEscalated === true,
    details: ticketAfterList2?.isEscalated
      ? `✓ 重新催办成功，催办时间=${ticketAfterList2.escalatedAt?.slice(11, 19)}`
      : `❌ 未重新催办，isEscalated=${ticketAfterList2?.isEscalated}, listOk=${listRes2.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // 验证这次有新的催办记录
  const detailRes3 = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const escRecords3 = detailRes3.data?.data?.escalationRecords || [];
  allResults.push({
    name: '测试3-5：重开催办后有 ≥2 条催办记录（先撤销的 + 新催办的）',
    passed: detailRes3.ok && escRecords3.length >= 2,
    details: escRecords3.length >= 2
      ? `✓ 共 ${escRecords3.length} 条催办记录`
      : `❌ 只有 ${escRecords3.length} 条催办记录，detailOk=${detailRes3.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 测试 4：导出字段包含催办信息
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 测试 4：导出字段一致性\n');

  const exportJsonRes = await api('/export/tickets?format=json', { headers: adminHeaders });
  let jsonHasEscalationFields = false;
  try {
    const jsonData = JSON.parse(exportJsonRes.body);
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const keys = Object.keys(jsonData[0]);
      jsonHasEscalationFields = keys.includes('是否催办') && keys.includes('催办时间') && keys.includes('升级原因') && keys.includes('升级负责人');
    }
  } catch {}
  allResults.push({
    name: '测试4-1：JSON 导出包含 4 个催办字段',
    passed: exportJsonRes.ok && jsonHasEscalationFields,
    details: jsonHasEscalationFields
      ? '✓ JSON 导出包含：是否催办、催办时间、升级原因、升级负责人'
      : `❌ JSON 导出缺少催办字段，exportOk=${exportJsonRes.ok}`,
  });
  printResult(allResults[allResults.length - 1]);

  // ─────────────────────────────────────────────────────
  // 清理：恢复 pri_high 的原始响应时限
  // ─────────────────────────────────────────────────────
  console.log('\n▶ 清理：恢复 pri_high 原始配置\n');
  const restoreOk = await setPriHighResponseTime(adminHeaders, originalPriHighResponseTime);
  allResults.push({
    name: '清理：恢复 pri_high 原始响应时限',
    passed: restoreOk,
    details: restoreOk
      ? `✓ 已恢复为 ${originalPriHighResponseTime} 分钟`
      : `❌ 恢复失败`,
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
    console.log('  ✅ 全部通过！撤销催办后不会复发，重开后可重新催办，跨重启持久化正确。');
  }
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
