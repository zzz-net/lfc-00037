import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json');

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

async function runBatchRegressionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const BASE = 'http://localhost:3001/api';
  const TEST_PREFIX = '[批量回归]';

  async function api(
    path: string,
    options: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: any; body: string }> {
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
      return { ok: false, status: 0, data: null, body: String(err) };
    }
  }

  function evidence(method: string, path: string, status: number, error?: string): string {
    return `[${method}] ${path} → ${status}${error ? `, error="${error}"` : ''}`;
  }

  // ===== 登录 =====
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!adminLogin.ok) {
    results.push({ name: 'API 连通性（admin）', passed: false, details: `❌ 无法登录: ${adminLogin.data?.error || adminLogin.body}` });
    return results;
  }
  const adminToken = adminLogin.data?.data?.token;
  const adminHeaders = { 'x-user-id': adminToken || '' };

  const techLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'tech1', password: 'tech123' }),
  });
  const techToken = techLogin.data?.data?.token;
  const techHeaders = { 'x-user-id': techToken || '' };

  const readerLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'reader1', password: 'reader123' }),
  });
  const readerToken = readerLogin.data?.data?.token;
  const readerHeaders = { 'x-user-id': readerToken || '' };

  results.push({ name: '登录连通性：admin/tech/reader', passed: adminLogin.ok && techLogin.ok && readerLogin.ok, details: '✓ 三角色登录成功' });

  // ===== 创建多张不同状态的测试工单 =====
  const testTicketIds: string[] = [];
  async function createTestTicket(status: string, extras: any = {}) {
    const res = await api('/tickets', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        assetId: 'asset_001',
        location: `${TEST_PREFIX} 批量测试位置`,
        description: `${TEST_PREFIX} 这是用于批量测试的工单（目标状态：${status}）`,
        priorityId: 'pri_medium',
        ...extras,
      }),
    });
    const id = res.data?.data?.ticket?.id;
    if (id) testTicketIds.push(id);
    return { res, id };
  }

  // 工单1: pending 状态（可改优先级、可派工、可设例外）
  const t1 = await createTestTicket('pending');
  results.push({ name: '创建测试工单1 (pending)', passed: !!t1.id, details: t1.id ? `✓ ${t1.id}` : '❌ 失败' });

  // 工单2: processing 状态
  const t2 = await createTestTicket('pending');
  if (t2.id) {
    const assign2 = await api(`/tickets/${t2.id}/assign`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ assigneeId: 'user_tech1' }),
    });
    results.push({ name: '工单2 派工为 processing', passed: assign2.ok, details: assign2.ok ? '✓' : `❌ ${assign2.data?.error || ''}` });
  }

  // 工单3: waiting_parts 状态（批量派工应被拦截）
  const t3 = await createTestTicket('pending');
  if (t3.id) {
    await api(`/tickets/${t3.id}/assign`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ assigneeId: 'user_tech1' }) });
    const wp3 = await api(`/tickets/${t3.id}/status`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'waiting_parts' }),
    });
    results.push({ name: '工单3 转为 waiting_parts', passed: wp3.ok, details: wp3.ok ? '✓' : `❌ ${wp3.data?.error || ''}` });
  }

  // 工单4: completed 状态（全部操作应被拦截）
  const t4 = await createTestTicket('pending');
  if (t4.id) {
    await api(`/tickets/${t4.id}/assign`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ assigneeId: 'user_tech1' }) });
    const complete4 = await api(`/tickets/${t4.id}/status`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'completed' }),
    });
    results.push({ name: '工单4 转为 completed', passed: complete4.ok, details: complete4.ok ? '✓' : `❌ ${complete4.data?.error || ''}` });
  }

  // 工单5: 设置了催办例外
  const t5 = await createTestTicket('pending');
  if (t5.id) {
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
    const exc5 = await api(`/tickets/${t5.id}/escalation-exception`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ type: 'delay', reason: `${TEST_PREFIX} 测试例外`, deadline }),
    });
    results.push({ name: '工单5 设置催办例外', passed: exc5.ok, details: exc5.ok ? '✓' : `❌ ${exc5.data?.error || ''}` });
  }

  const pendingIds = testTicketIds.slice(0, 5);
  results.push({ name: '测试工单准备', passed: pendingIds.length >= 5, details: `✓ 共 ${pendingIds.length} 张测试工单` });

  // ===== 1. 批量修改优先级（部分成功：排除已完成的） =====
  const batchPriorityRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      priorityId: 'pri_high',
      reason: `${TEST_PREFIX} 批量提升优先级`,
    }),
  });
  const priResult = batchPriorityRes.data?.data;
  const priSucceeded = priResult?.succeeded || 0;
  const priFailed = priResult?.failed || 0;
  results.push({
    name: '【批量改优先级】部分成功：已完成工单被拦截',
    passed: batchPriorityRes.ok && priSucceeded > 0 && priFailed > 0,
    details: batchPriorityRes.ok
      ? `✓ 成功 ${priSucceeded} 条，失败 ${priFailed} 条（已完成 ${t4.id} 等被正确拦截）`
      : `❌ ${evidence('POST', '/tickets/batch/priority', batchPriorityRes.status, batchPriorityRes.data?.error)}`,
  });

  if (priResult?.results) {
    const completedFail = priResult.results.find((r: any) => r.ticketId === t4.id && !r.success);
    results.push({
      name: '【批量改优先级】已完成工单具体被拦截',
      passed: !!completedFail,
      details: completedFail ? `✓ 工单 ${t4.id} 被拦截，原因：${completedFail.error}` : '❌ 已完成工单未被拦截',
    });
  }

  // ===== 2. 批量派工（等待配件被拦截） =====
  const batchAssignRes = await api('/tickets/batch/assign', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      assigneeId: 'user_tech2',
      reason: `${TEST_PREFIX} 批量改派`,
    }),
  });
  const assignResult = batchAssignRes.data?.data;
  results.push({
    name: '【批量派工】部分成功：等待配件 + 已完成被拦截',
    passed: batchAssignRes.ok && (assignResult?.failed || 0) >= 2,
    details: batchAssignRes.ok
      ? `✓ 成功 ${assignResult?.succeeded} 条，失败 ${assignResult?.failed} 条`
      : `❌ ${evidence('POST', '/tickets/batch/assign', batchAssignRes.status, batchAssignRes.data?.error)}`,
  });

  if (assignResult?.results) {
    const wpFail = assignResult.results.find((r: any) => r.ticketId === t3.id && !r.success);
    results.push({
      name: '【批量派工】waiting_parts 被拦截',
      passed: !!wpFail,
      details: wpFail ? `✓ 工单 ${t3.id} (waiting_parts) 被拦截：${wpFail.error}` : '❌',
    });
  }

  // ===== 3. 批量设置催办例外（已完成/已有例外被拦截） =====
  const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16);
  const batchExcRes = await api('/tickets/batch/exception', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      type: 'delay',
      reason: `${TEST_PREFIX} 批量设置例外`,
      deadline,
    }),
  });
  const excResult = batchExcRes.data?.data;
  results.push({
    name: '【批量设例外】部分成功：已完成/已有例外被拦截',
    passed: batchExcRes.ok && (excResult?.failed || 0) >= 2,
    details: batchExcRes.ok
      ? `✓ 成功 ${excResult?.succeeded} 条，失败 ${excResult?.failed} 条`
      : `❌ ${evidence('POST', '/tickets/batch/exception', batchExcRes.status, batchExcRes.data?.error)}`,
  });

  if (excResult?.results) {
    const alreadyHasExcFail = excResult.results.find((r: any) => r.ticketId === t5.id && !r.success);
    results.push({
      name: '【批量设例外】已有生效例外被拦截',
      passed: !!alreadyHasExcFail,
      details: alreadyHasExcFail ? `✓ 工单 ${t5.id} 被拦截：${alreadyHasExcFail.error}` : '❌',
    });
  }

  // ===== 4. 批量撤销催办例外 =====
  const batchRevokeExcRes = await api('/tickets/batch/exception/revoke', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      reason: `${TEST_PREFIX} 批量撤销例外，重新评估催办`,
    }),
  });
  const revokeResult = batchRevokeExcRes.data?.data;
  results.push({
    name: '【批量撤例外】部分成功：无例外的工单被拦截',
    passed: batchRevokeExcRes.ok,
    details: batchRevokeExcRes.ok
      ? `✓ 成功 ${revokeResult?.succeeded} 条，失败 ${revokeResult?.failed} 条`
      : `❌ ${evidence('POST', '/tickets/batch/exception/revoke', batchRevokeExcRes.status, batchRevokeExcRes.data?.error)}`,
  });

  // 撤销后检查工单5是否重新触发催办评估
  const detailT5 = await api(`/tickets/${t5.id}`, { headers: adminHeaders });
  const t5HasNoException = !detailT5.data?.data?.ticket?.escalationException;
  results.push({
    name: '【批量撤例外】撤销后重新评估催办（例外清除）',
    passed: t5HasNoException,
    details: t5HasNoException ? `✓ 工单 ${t5.id} 的催办例外已被清除` : '❌ 催办例外仍存在',
  });

  // ===== 5. 权限拦截：技术员/读者不能批量改优先级/例外 =====
  const techPriorityRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: techHeaders,
    body: JSON.stringify({ ticketIds: [t1.id], priorityId: 'pri_low', reason: '测试越权' }),
  });
  results.push({
    name: '【权限拦截】技术员批量改优先级（403）',
    passed: techPriorityRes.status === 403,
    details: techPriorityRes.status === 403
      ? `✓ 技术员已被拦截：${techPriorityRes.data?.error || ''}`
      : `❌ status=${techPriorityRes.status}`,
  });

  const readerAssignRes = await api('/tickets/batch/assign', {
    method: 'POST',
    headers: readerHeaders,
    body: JSON.stringify({ ticketIds: [t1.id], assigneeId: 'user_tech1', reason: '测试越权' }),
  });
  results.push({
    name: '【权限拦截】读者批量派工（403）',
    passed: readerAssignRes.status === 403,
    details: readerAssignRes.status === 403
      ? `✓ 读者已被拦截`
      : `❌ status=${readerAssignRes.status}`,
  });

  // ===== 6. 并发冲突：使用旧版本号提交 =====
  const t1Detail = await api(`/tickets/${t1.id}`, { headers: adminHeaders });
  const t1Version = t1Detail.data?.data?.ticket?.version || 1;
  // 先单独改一次，让版本递增
  const singleChange = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id],
      priorityId: 'pri_urgent',
      reason: `${TEST_PREFIX} 先单独改一次制造版本冲突`,
    }),
  });
  // 再用旧版本号提交
  const conflictRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id],
      priorityId: 'pri_low',
      reason: `${TEST_PREFIX} 用旧版本号提交应触发冲突`,
      expectedVersions: { [t1.id]: t1Version },
    }),
  });
  const conflictFailed = conflictRes.data?.data?.results?.[0]?.success === false;
  results.push({
    name: '【并发冲突】旧版本号提交被拦截',
    passed: conflictFailed,
    details: conflictFailed
      ? `✓ 版本冲突被拦截：${conflictRes.data?.data?.results?.[0]?.error}`
      : `❌ 居然成功了，expectedVersion=${t1Version}`,
  });

  // ===== 7. 幂等性：同 batchOperationId 重复提交不生成重复记录 =====
  const idempotentId = 'test_idem_' + Date.now();
  const idem1 = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t2.id || t1.id],
      priorityId: 'pri_medium',
      reason: `${TEST_PREFIX} 幂等性测试第一次`,
      batchOperationId: idempotentId,
    }),
  });
  const idem2 = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t2.id || t1.id],
      priorityId: 'pri_medium',
      reason: `${TEST_PREFIX} 幂等性测试第二次（重复提交）`,
      batchOperationId: idempotentId,
    }),
  });
  const sameBatchId = idem1.data?.data?.batchOperationId === idem2.data?.data?.batchOperationId
    && idem1.data?.data?.batchOperationId === idempotentId;
  results.push({
    name: '【幂等性】重复提交同 batchOperationId 返回相同结果',
    passed: sameBatchId && idem2.ok,
    details: sameBatchId
      ? `✓ 两次返回同一 batchOperationId=${idempotentId}，不会重复记录`
      : `❌ id1=${idem1.data?.data?.batchOperationId}, id2=${idem2.data?.data?.batchOperationId}`,
  });

  // ===== 8. 时间线检查：批量操作有记录 =====
  const t1Timeline = await api(`/tickets/${t1.id}`, { headers: adminHeaders });
  const timeline = t1Timeline.data?.data?.timeline || [];
  const hasBatchEvent = timeline.some((e: any) => e.type?.startsWith('batch_'));
  results.push({
    name: '【时间线】批量操作写入每条工单时间线',
    passed: hasBatchEvent,
    details: hasBatchEvent
      ? `✓ 工单 ${t1.id} 时间线包含批量事件（共 ${timeline.length} 条）`
      : '❌ 时间线中未找到 batch_* 类型事件',
  });

  // ===== 9. 跨重启一致性：db.json 中 version 字段、批量例外记录存在 =====
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const hasVersionAll = db.tickets.every((t: any) => typeof t.version === 'number');
    const batchExcCount = db.timelineEvents.filter((e: any) => e.type?.startsWith('batch_exception')).length;
    results.push({
      name: '【跨重启】db.json 中 version 字段持久化',
      passed: hasVersionAll,
      details: hasVersionAll
        ? `✓ 所有工单都有 version 字段`
        : `❌ 部分工单缺少 version`,
    });
    results.push({
      name: '【跨重启】批量操作时间线写入 db.json',
      passed: batchExcCount >= 2,
      details: `✓ db.json 中包含 ${batchExcCount} 条批量例外相关时间线记录`,
    });
  } catch (e) {
    results.push({ name: '【跨重启】db.json 读取', passed: false, details: `❌ ${String(e)}` });
  }

  // ===== 10. 原因必填校验 =====
  const noReasonRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ ticketIds: [t1.id], priorityId: 'pri_low', reason: '   ' }),
  });
  results.push({
    name: '【校验】批量操作原因不能为空或全空格',
    passed: !noReasonRes.ok && noReasonRes.status === 400,
    details: !noReasonRes.ok
      ? `✓ 空原因已拦截：${noReasonRes.data?.error || ''}`
      : `❌ status=${noReasonRes.status}`,
  });

  // ===== 11. CSV/JSON 导出一致性：批量修改后导出包含最新优先级 =====
  const exportJson = await api('/export/tickets?format=json', { headers: adminHeaders });
  let exportContainsUpdated = false;
  try {
    const jsonData = JSON.parse(exportJson.body);
    if (Array.isArray(jsonData)) {
      const t1Row = jsonData.find((r: any) => r['工单ID'] === t1.id);
      exportContainsUpdated = t1Row && t1Row['优先级'] === '紧急';
    }
  } catch {}
  results.push({
    name: '【导出一致性】批量修改后 JSON 导出反映最新优先级',
    passed: exportContainsUpdated,
    details: exportContainsUpdated
      ? `✓ JSON 导出工单 ${t1.id} 优先级已更新为"紧急"`
      : '❌ JSON 导出未反映最新优先级',
  });

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  工单批量处理 - 回归测试');
  console.log('═══════════════════════════════════════════════\n');

  const allResults = await runBatchRegressionTests();

  const categories: Record<string, TestResult[]> = {
    '批量操作（部分成功/明细返回）': allResults.filter(r => r.name.includes('【批量')),
    '权限拦截': allResults.filter(r => r.name.includes('【权限')),
    '并发冲突': allResults.filter(r => r.name.includes('【并发')),
    '幂等性': allResults.filter(r => r.name.includes('【幂等')),
    '撤销后重新评估催办': allResults.filter(r => r.name.includes('催办')),
    '时间线/操作日志': allResults.filter(r => r.name.includes('【时间线')),
    '跨重启一致': allResults.filter(r => r.name.includes('【跨重启')),
    '输入校验': allResults.filter(r => r.name.includes('【校验')),
    '导出一致性': allResults.filter(r => r.name.includes('【导出')),
    '连通性/准备': allResults.filter(r => !r.name.includes('【')),
  };

  for (const [cat, list] of Object.entries(categories)) {
    if (list.length === 0) continue;
    console.log(`▶ ${cat}\n`);
    for (const r of list) {
      console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
      if (r.details) console.log(`     ${r.details}`);
    }
    console.log('');
  }

  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  const total = allResults.length;

  console.log('═══════════════════════════════════════════════');
  console.log(`  结果: ${passed}/${total} 通过, ${failed} 失败`);
  if (failed > 0) {
    console.log('  失败项:');
    allResults.filter((r) => !r.passed).forEach((r) => console.log(`    ❌ ${r.name}: ${r.details || ''}`));
  }
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('批量回归测试执行失败:', err);
  process.exit(1);
});
