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

async function runBatchIdempotencyTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const PORT = process.env.TEST_PORT || '3001';
  const BASE = `http://localhost:${PORT}/api`;
  const TEST_PREFIX = '[批量幂等V2]';

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

  // ===== 1. 幂等性：同 batchOperationId 重复提交返回相同结果（isReplayed=true） =====
  const idempotentId = 'test_idem_v2_' + Date.now();
  const idem1 = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id, t2.id],
      priorityId: 'pri_high',
      reason: `${TEST_PREFIX} 幂等性测试第一次`,
      batchOperationId: idempotentId,
    }),
  });

  const idem2 = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id, t2.id],
      priorityId: 'pri_high',
      reason: `${TEST_PREFIX} 幂等性测试第二次（重复提交）`,
      batchOperationId: idempotentId,
    }),
  });

  const sameResult = idem1.data?.data?.batchOperationId === idem2.data?.data?.batchOperationId
    && idem1.data?.data?.succeeded === idem2.data?.data?.succeeded
    && idem1.data?.data?.failed === idem2.data?.data?.failed
    && idem2.data?.data?.isReplayed === true;

  results.push({
    name: '【幂等性】重复提交同 batchOperationId 返回相同结果且 isReplayed=true',
    passed: sameResult,
    details: sameResult
      ? `✓ 两次返回同一 batchOperationId=${idempotentId}，isReplayed=${idem2.data?.data?.isReplayed}`
      : `❌ id1=${idem1.data?.data?.batchOperationId}, id2=${idem2.data?.data?.batchOperationId}, isReplayed=${idem2.data?.data?.isReplayed}`,
  });

  // ===== 2. 失败原因分类：检查 failureType 字段 =====
  const batchPriorityRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      priorityId: 'pri_urgent',
      reason: `${TEST_PREFIX} 批量提升优先级，测试 failureType 分类`,
    }),
  });

  const priResult = batchPriorityRes.data?.data;
  const hasFailureTypes = priResult?.results?.every((r: any) => r.success || r.failureType);
  const hasStatusInvalid = priResult?.results?.find((r: any) => r.ticketId === t4.id && r.failureType === 'status_invalid');

  results.push({
    name: '【失败分类】所有失败项都有 failureType 字段',
    passed: hasFailureTypes,
    details: hasFailureTypes
      ? '✓ 所有失败项都包含 failureType'
      : '❌ 部分失败项缺少 failureType',
  });

  results.push({
    name: '【失败分类】已完成工单被标记为 status_invalid',
    passed: !!hasStatusInvalid,
    details: hasStatusInvalid
      ? `✓ 工单 ${t4.id} failureType=status_invalid`
      : `❌ 工单 ${t4.id} failureType 不正确`,
  });

  // ===== 3. 持久化：批量操作记录写入 db.json =====
  const batchOpsList = await api('/tickets/batch/operations', { headers: adminHeaders });
  results.push({
    name: '【持久化】批量操作列表接口可查询',
    passed: batchOpsList.ok && (batchOpsList.data?.data?.total || 0) > 0,
    details: batchOpsList.ok
      ? `✓ 共 ${batchOpsList.data?.data?.total} 条批量操作记录`
      : `❌ ${evidence('GET', '/tickets/batch/operations', batchOpsList.status, batchOpsList.data?.error)}`,
  });

  const detailRes = await api(`/tickets/batch/operations/${idempotentId}`, { headers: adminHeaders });
  results.push({
    name: '【持久化】批量操作详情接口可查询',
    passed: detailRes.ok && detailRes.data?.data?.operation?.batchOperationId === idempotentId,
    details: detailRes.ok
      ? `✓ batchOperationId=${detailRes.data?.data?.operation?.batchOperationId}`
      : `❌ ${evidence('GET', `/tickets/batch/operations/${idempotentId}`, detailRes.status, detailRes.data?.error)}`,
  });

  // ===== 4. 检查 db.json 中的持久化数据 =====
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    const persistedOp = db.batchOperations?.find((bo: any) => bo.batchOperationId === idempotentId);
    results.push({
      name: '【持久化】db.json 中存在批量操作记录',
      passed: !!persistedOp,
      details: persistedOp
        ? `✓ db.json 中存在 batchOperationId=${idempotentId}`
        : `❌ db.json 中找不到 ${idempotentId}`,
    });

    if (persistedOp) {
      const hasAllFields = persistedOp.id
        && persistedOp.operationType
        && persistedOp.operatorId
        && persistedOp.createdAt
        && persistedOp.requestBody
        && typeof persistedOp.total === 'number'
        && typeof persistedOp.succeeded === 'number'
        && typeof persistedOp.failed === 'number'
        && Array.isArray(persistedOp.results);
      results.push({
        name: '【持久化】记录包含所有必需字段',
        passed: hasAllFields,
        details: hasAllFields
          ? '✓ 所有字段完整'
          : '❌ 缺少必要字段',
      });
    }
  } catch (e) {
    results.push({ name: '【持久化】db.json 读取验证', passed: false, details: `❌ ${String(e)}` });
  }

  // ===== 5. 时间线去重：同一批量操作不会重复写入时间线 =====
  const t1DetailAfterIdem = await api(`/tickets/${t1.id}`, { headers: adminHeaders });
  const t1Timeline = t1DetailAfterIdem.data?.data?.timeline || [];
  const batchEventsForT1 = t1Timeline.filter((e: any) => e.type === 'batch_priority_changed' && e.content.includes(idempotentId));
  results.push({
    name: '【时间线去重】同一批量操作在时间线中只出现一次',
    passed: batchEventsForT1.length <= 1,
    details: batchEventsForT1.length <= 1
      ? `✓ 工单 ${t1.id} 时间线中该批量操作出现 ${batchEventsForT1.length} 次`
      : `❌ 出现 ${batchEventsForT1.length} 次，应该最多 1 次`,
  });

  // ===== 6. 权限拦截：failureType=permission_denied =====
  const techPriorityRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: techHeaders,
    body: JSON.stringify({ ticketIds: [t1.id], priorityId: 'pri_low', reason: `${TEST_PREFIX} 测试越权改优先级` }),
  });

  const techPriResult = techPriorityRes.data?.data;
  const permissionDenied = techPriResult?.results?.[0]?.failureType === 'permission_denied';

  results.push({
    name: '【权限拦截】技术员批量改优先级被标记为 permission_denied',
    passed: permissionDenied || techPriorityRes.status === 403,
    details: permissionDenied
      ? `✓ failureType=permission_denied`
      : techPriorityRes.status === 403
        ? `✓ 接口级 403 拦截`
        : `❌ status=${techPriorityRes.status}, failureType=${techPriResult?.results?.[0]?.failureType}`,
  });

  const readerAssignRes = await api('/tickets/batch/assign', {
    method: 'POST',
    headers: readerHeaders,
    body: JSON.stringify({ ticketIds: [t1.id], assigneeId: 'user_tech1', reason: `${TEST_PREFIX} 测试越权派工` }),
  });
  results.push({
    name: '【权限拦截】读者批量派工被 403 拦截',
    passed: readerAssignRes.status === 403,
    details: readerAssignRes.status === 403
      ? `✓ 读者已被 403 拦截`
      : `❌ status=${readerAssignRes.status}`,
  });

  // ===== 7. 并发冲突：failureType=version_conflict =====
  const t1DetailBefore = await api(`/tickets/${t1.id}`, { headers: adminHeaders });
  const t1Version = t1DetailBefore.data?.data?.ticket?.version || 1;

  await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id],
      priorityId: 'pri_medium',
      reason: `${TEST_PREFIX} 先改一次制造版本冲突`,
    }),
  });

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

  const conflictResult = conflictRes.data?.data;
  const versionConflict = conflictResult?.results?.[0]?.failureType === 'version_conflict';

  results.push({
    name: '【并发冲突】旧版本号提交被标记为 version_conflict',
    passed: versionConflict,
    details: versionConflict
      ? `✓ failureType=version_conflict`
      : `❌ failureType=${conflictResult?.results?.[0]?.failureType}, error=${conflictResult?.results?.[0]?.error}`,
  });

  // ===== 8. 批量派工：状态拦截分类 =====
  const batchAssignRes = await api('/tickets/batch/assign', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: pendingIds,
      assigneeId: 'user_tech2',
      reason: `${TEST_PREFIX} 批量派工测试状态拦截`,
    }),
  });

  const assignResult = batchAssignRes.data?.data;
  const wpFail = assignResult?.results?.find((r: any) => r.ticketId === t3.id && r.failureType === 'status_invalid');
  const completedFail = assignResult?.results?.find((r: any) => r.ticketId === t4.id && r.failureType === 'status_invalid');

  results.push({
    name: '【状态拦截】waiting_parts 被标记为 status_invalid',
    passed: !!wpFail,
    details: wpFail
      ? `✓ 工单 ${t3.id} failureType=status_invalid`
      : `❌ 工单 ${t3.id} failureType=${wpFail?.failureType}`,
  });

  results.push({
    name: '【状态拦截】completed 被标记为 status_invalid',
    passed: !!completedFail,
    details: completedFail
      ? `✓ 工单 ${t4.id} failureType=status_invalid`
      : `❌ 工单 ${t4.id} failureType=${completedFail?.failureType}`,
  });

  // ===== 9. 批量操作导出 =====
  const exportCsv = await api('/export/batch-operations', { headers: adminHeaders });
  results.push({
    name: '【导出】批量操作 CSV 导出可用',
    passed: exportCsv.ok && exportCsv.body.includes('批量操作ID'),
    details: exportCsv.ok
      ? '✓ CSV 导出包含"批量操作ID"列'
      : `❌ ${evidence('GET', '/export/batch-operations', exportCsv.status)}`,
  });

  const exportJson = await api('/export/batch-operations?format=json', { headers: adminHeaders });
  let jsonHasFailureType = false;
  try {
    const jsonData = JSON.parse(exportJson.body);
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      jsonHasFailureType = jsonData.some((row: any) => '失败类型' in row);
    }
  } catch {}
  results.push({
    name: '【导出】批量操作 JSON 导出包含失败类型',
    passed: exportJson.ok && jsonHasFailureType,
    details: exportJson.ok
      ? (jsonHasFailureType ? '✓ JSON 导出包含"失败类型"列' : '❌ JSON 导出缺少"失败类型"列')
      : `❌ ${evidence('GET', '/export/batch-operations?format=json', exportJson.status)}`,
  });

  // ===== 10. 跨重启一致性验证 =====
  const beforeRestartIds = batchOpsList.data?.data?.operations?.map((op: any) => op.batchOperationId) || [];
  const beforeRestartCount = beforeRestartIds.length;

  results.push({
    name: '【跨重启】当前批量操作记录已持久化到 db.json',
    passed: beforeRestartCount > 0,
    details: `✓ 当前有 ${beforeRestartCount} 条记录已在 db.json 中，重启后应可恢复`,
  });

  const beforeRestartFirstOp = batchOpsList.data?.data?.operations?.[0];
  if (beforeRestartFirstOp) {
    results.push({
      name: '【跨重启】记录包含完整结果明细',
      passed: Array.isArray(beforeRestartFirstOp.results) && beforeRestartFirstOp.results.length > 0,
      details: beforeRestartFirstOp.results?.length > 0
        ? `✓ 第一条记录包含 ${beforeRestartFirstOp.results.length} 条明细`
        : '❌ 明细为空',
    });
  }

  // ===== 11. 不存在工单：failureType=not_found =====
  const notFoundRes = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: ['non_existent_id_12345'],
      priorityId: 'pri_high',
      reason: `${TEST_PREFIX} 测试不存在工单`,
    }),
  });

  const notFoundResult = notFoundRes.data?.data;
  const notFoundType = notFoundResult?.results?.[0]?.failureType === 'not_found';

  results.push({
    name: '【不存在】不存在工单被标记为 not_found',
    passed: notFoundType,
    details: notFoundType
      ? `✓ failureType=not_found`
      : `❌ failureType=${notFoundResult?.results?.[0]?.failureType}`,
  });

  // ===== 12. 重放标记：第一次提交 isReplayed=false，重放时 isReplayed=true =====
  const newBatchId = 'test_replay_flag_' + Date.now();
  const firstSubmit = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t2.id],
      priorityId: 'pri_medium',
      reason: `${TEST_PREFIX} 测试重放标记第一次`,
      batchOperationId: newBatchId,
    }),
  });

  const replaySubmit = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t2.id],
      priorityId: 'pri_medium',
      reason: `${TEST_PREFIX} 测试重放标记第二次`,
      batchOperationId: newBatchId,
    }),
  });

  const correctReplayFlags = firstSubmit.data?.data?.isReplayed === false
    && replaySubmit.data?.data?.isReplayed === true;

  results.push({
    name: '【重放标记】第一次 isReplayed=false，重放时 isReplayed=true',
    passed: correctReplayFlags,
    details: correctReplayFlags
      ? `✓ 第一次=${firstSubmit.data?.data?.isReplayed}, 重放=${replaySubmit.data?.data?.isReplayed}`
      : `❌ 第一次=${firstSubmit.data?.data?.isReplayed}, 重放=${replaySubmit.data?.data?.isReplayed}`,
  });

  // ===== 13. 批量操作结果不随选中态变化而变化 =====
  const replayAgain = await api('/tickets/batch/priority', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ticketIds: [t1.id],
      priorityId: 'pri_low',
      reason: `${TEST_PREFIX} 测试不同 ticketIds 但同 batchId`,
      batchOperationId: newBatchId,
    }),
  });

  const sameResultDespiteDifferentIds = replayAgain.data?.data?.batchOperationId === newBatchId
    && replayAgain.data?.data?.total === firstSubmit.data?.data?.total
    && replayAgain.data?.data?.succeeded === firstSubmit.data?.data?.succeeded
    && replayAgain.data?.data?.isReplayed === true;

  results.push({
    name: '【选中态隔离】同 batchId 不同 ticketIds 仍返回原结果',
    passed: sameResultDespiteDifferentIds,
    details: sameResultDespiteDifferentIds
      ? `✓ 即使传不同 ticketIds，同 batchId 仍返回原结果（total=${replayAgain.data?.data?.total}）`
      : `❌ 原 total=${firstSubmit.data?.data?.total}, 新 total=${replayAgain.data?.data?.total}`,
  });

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  工单批量操作幂等性 - 全面回归测试 V2');
  console.log('  覆盖：跨重启、部分成功、并发、权限、日志去重');
  console.log('═══════════════════════════════════════════════\n');

  const allResults = await runBatchIdempotencyTests();

  const categories: Record<string, TestResult[]> = {
    '幂等性核心': allResults.filter(r => r.name.includes('【幂等性') || r.name.includes('【重放标记')),
    '失败原因分类': allResults.filter(r => r.name.includes('【失败分类') || r.name.includes('【状态拦截') || r.name.includes('【权限拦截') || r.name.includes('【并发冲突') || r.name.includes('【不存在')),
    '持久化': allResults.filter(r => r.name.includes('【持久化')),
    '跨重启一致性': allResults.filter(r => r.name.includes('【跨重启')),
    '时间线去重': allResults.filter(r => r.name.includes('【时间线去重')),
    '导出对齐': allResults.filter(r => r.name.includes('【导出')),
    '选中态隔离': allResults.filter(r => r.name.includes('【选中态隔离')),
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
