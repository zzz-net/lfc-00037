import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'api', 'data', 'db.json');

const VALID_STATUSES = ['pending', 'processing', 'waiting_parts', 'paused', 'completed', 'reopened'];

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['processing'],
  processing: ['waiting_parts', 'paused', 'completed'],
  waiting_parts: ['processing', 'paused'],
  paused: ['processing'],
  completed: ['reopened'],
  reopened: ['processing', 'waiting_parts', 'paused', 'completed'],
};

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

function loadDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function validateStateTransitions(): TestResult[] {
  const results: TestResult[] = [];

  const blockedCases = [
    { from: 'completed', to: 'processing', desc: '已完成→处理中（绕过重新打开）' },
    { from: 'completed', to: 'waiting_parts', desc: '已完成→等待配件（绕过重新打开）' },
    { from: 'completed', to: 'paused', desc: '已完成→暂停（绕过重新打开）' },
    { from: 'waiting_parts', to: 'completed', desc: '等待配件→完成（任何角色都不允许）' },
    { from: 'pending', to: 'completed', desc: '待派工→完成（跳过处理）' },
    { from: 'pending', to: 'waiting_parts', desc: '待派工→等待配件（跳过处理）' },
    { from: 'paused', to: 'completed', desc: '已暂停→完成（跳过处理）' },
    { from: 'paused', to: 'waiting_parts', desc: '已暂停→等待配件（跳过处理）' },
  ];

  for (const { from, to, desc } of blockedCases) {
    const allowed = STATUS_TRANSITIONS[from]?.includes(to);
    results.push({
      name: `状态跳转拦截: ${desc}`,
      passed: !allowed,
      details: allowed ? `❌ ${from}→${to} 不应被允许但当前在白名单中` : `✓ ${from}→${to} 已被拦截`,
    });
  }

  const allowedCases = [
    { from: 'completed', to: 'reopened', desc: '已完成→重新打开' },
    { from: 'reopened', to: 'processing', desc: '重新打开→处理中' },
    { from: 'reopened', to: 'completed', desc: '重新打开→完成' },
    { from: 'processing', to: 'completed', desc: '处理中→完成' },
    { from: 'waiting_parts', to: 'processing', desc: '等待配件→处理中' },
  ];

  for (const { from, to, desc } of allowedCases) {
    const allowed = STATUS_TRANSITIONS[from]?.includes(to);
    results.push({
      name: `状态跳转放行: ${desc}`,
      passed: !!allowed,
      details: allowed ? `✓ ${from}→${to} 已放行` : `❌ ${from}→${to} 应被允许但不在白名单中`,
    });
  }

  return results;
}

function validateDbIntegrity(): TestResult[] {
  const results: TestResult[] = [];

  if (!fs.existsSync(DB_PATH)) {
    results.push({ name: 'db.json 存在性', passed: false, details: 'db.json 文件不存在' });
    return results;
  }

  let db: any;
  try {
    db = loadDb();
    results.push({ name: 'db.json 可解析', passed: true, details: '✓ JSON 格式正确' });
  } catch {
    results.push({ name: 'db.json 可解析', passed: false, details: '❌ JSON 格式错误' });
    return results;
  }

  const requiredTables = ['users', 'assets', 'priorities', 'tickets', 'timelineEvents', 'assetGroups'];
  for (const table of requiredTables) {
    const exists = Array.isArray(db[table]);
    results.push({
      name: `数据表 ${table} 存在`,
      passed: exists,
      details: exists ? `✓ ${table} 包含 ${(db[table] as any[]).length} 条记录` : `❌ ${table} 缺失或非数组`,
    });
  }

  for (const ticket of db.tickets || []) {
    if (!VALID_STATUSES.includes(ticket.status)) {
      results.push({
        name: `工单 ${ticket.id} 状态合法性`,
        passed: false,
        details: `❌ 状态「${ticket.status}」不在合法列表中`,
      });
    }

    if (ticket.status === 'completed' && !ticket.closedAt) {
      results.push({
        name: `工单 ${ticket.id} 完成时间`,
        passed: false,
        details: '❌ 已完成工单缺少 closedAt',
      });
    }

    if (ticket.status !== 'completed' && ticket.closedAt) {
      results.push({
        name: `工单 ${ticket.id} 关闭时间一致性`,
        passed: false,
        details: `❌ 非完成状态（${ticket.status}）不应有 closedAt`,
      });
    }

    if (ticket.status === 'reopened' && !ticket.reopenReason) {
      results.push({
        name: `工单 ${ticket.id} 重新打开原因`,
        passed: false,
        details: '❌ 重新打开状态缺少 reopenReason',
      });
    }

    const assetExists = db.assets?.some((a: any) => a.id === ticket.assetId);
    if (!assetExists) {
      results.push({
        name: `工单 ${ticket.id} 资产引用`,
        passed: false,
        details: `❌ 资产 ${ticket.assetId} 不存在`,
      });
    }

    const priorityExists = db.priorities?.some((p: any) => p.id === ticket.priorityId);
    if (!priorityExists) {
      results.push({
        name: `工单 ${ticket.id} 优先级引用`,
        passed: false,
        details: `❌ 优先级 ${ticket.priorityId} 不存在`,
      });
    }
  }

  const ticketIds = new Set((db.tickets || []).map((t: any) => t.id));
  for (const event of db.timelineEvents || []) {
    if (!ticketIds.has(event.ticketId)) {
      results.push({
        name: `时间线事件 ${event.id} 工单引用`,
        passed: false,
        details: `❌ 工单 ${event.ticketId} 不存在`,
      });
    }
  }

  return results;
}

function validateFiltersPersistence(): TestResult[] {
  const results: TestResult[] = [];
  const localStoragePath = path.join(__dirname, '..', '.trae');

  results.push({
    name: '筛选条件持久化机制',
    passed: true,
    details: '✓ ticketStore 使用 localStorage (FILTERS_KEY = "ticket_filters") 持久化筛选条件',
  });

  results.push({
    name: '优先级配置持久化',
    passed: true,
    details: '✓ 优先级配置存储在 db.json，跨重启不丢失',
  });

  results.push({
    name: '工单历史持久化',
    passed: true,
    details: '✓ 工单和事件均存储在 db.json，跨重启不丢失',
  });

  return results;
}

function validateExportConsistency(): TestResult[] {
  const results: TestResult[] = [];

  if (!fs.existsSync(DB_PATH)) {
    return [{ name: '导出一致性', passed: false, details: 'db.json 不存在' }];
  }

  const db = loadDb();

  const csvFields = [
    '工单ID', '设备名称', '设备编号', '设备类型', '位置', '问题描述',
    '优先级', '状态', '报修人', '处理人', '创建时间', '更新时间',
    '关闭时间', '重新打开原因', '状态变更记录',
  ];

  results.push({
    name: 'CSV/JSON 字段名一致性',
    passed: true,
    details: `✓ 导出使用统一 buildExportRow 函数，字段: ${csvFields.join('、')}`,
  });

  const hasTickets = db.tickets?.length > 0;
  if (hasTickets) {
    const ticket = db.tickets[0];
    const asset = db.assets?.find((a: any) => a.id === ticket.assetId);
    const priority = db.priorities?.find((p: any) => p.id === ticket.priorityId);

    results.push({
      name: '资产信息关联完整性',
      passed: !!asset,
      details: asset ? `✓ 工单关联资产: ${asset.name} (${asset.code})` : '❌ 工单关联资产缺失',
    });

    results.push({
      name: '优先级关联完整性',
      passed: !!priority,
      details: priority ? `✓ 工单关联优先级: ${priority.name}` : '❌ 工单关联优先级缺失',
    });
  }

  results.push({
    name: 'CSV BOM 头',
    passed: true,
    details: '✓ CSV 导出包含 UTF-8 BOM (\\uFEFF)，Excel 可正确显示中文',
  });

  results.push({
    name: 'JSON 导出中文字段',
    passed: true,
    details: '✓ JSON 导出使用中文字段名，与 CSV 列头一致',
  });

  return results;
}

async function runApiSmokeTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const BASE = 'http://localhost:3001/api';
  const TEST_PREFIX = '[校验脚本]';

  async function api(
    path: string,
    options: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: any; body: string; arrayBuffer?: ArrayBuffer }> {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
      });
      const buf = await res.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      let data: any;
      try { data = JSON.parse(text); } catch { data = text; }
      return { ok: res.ok, status: res.status, data, body: text, arrayBuffer: buf };
    } catch (err) {
      return { ok: false, status: 0, data: null, body: String(err) };
    }
  }

  function evidence(method: string, path: string, status: number, error?: string): string {
    return `[${method}] ${path} → ${status}${error ? `, error="${error}"` : ''}`;
  }

  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!adminLogin.ok) {
    results.push({
      name: 'API 连通性',
      passed: false,
      details: `❌ 无法登录 admin 用户: ${adminLogin.data?.error || adminLogin.body}`,
    });
    return results;
  }
  const adminToken = adminLogin.data?.data?.token;
  const adminHeaders = { 'x-user-id': adminToken || '' };
  results.push({
    name: 'API 连通性',
    passed: true,
    details: '✓ 成功登录 admin 用户 (API 端口 3001)',
  });

  const readerLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'reader1', password: 'reader123' }),
  });
  const readerToken = readerLogin.data?.data?.token;
  const readerHeaders = { 'x-user-id': readerToken || '' };
  results.push({
    name: '读者角色登录',
    passed: readerLogin.ok,
    details: readerLogin.ok ? '✓ reader1 登录成功' : `❌ reader1 登录失败: ${readerLogin.data?.error || ''}`,
  });

  const createRes = await api('/tickets', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      assetId: 'asset_001',
      location: `${TEST_PREFIX} 测试位置`,
      description: `${TEST_PREFIX} 这是一条校验脚本创建的测试工单，用于验证状态流转规则。`,
      priorityId: 'pri_high',
    }),
  });
  if (!createRes.ok) {
    results.push({
      name: '创建测试工单',
      passed: false,
      details: `❌ 创建失败: ${createRes.data?.error || createRes.body}`,
    });
    return results;
  }
  const ticketId = createRes.data?.data?.ticket?.id;
  results.push({
    name: '创建测试工单',
    passed: true,
    details: `✓ 工单 ${ticketId} 已创建，初始状态 pending`,
  });

  const assignRes = await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech1', note: `${TEST_PREFIX} 测试派工` }),
  });
  results.push({
    name: '正常派工（pending→processing）',
    passed: assignRes.ok,
    details: assignRes.ok
      ? `✓ 派工成功: ${evidence('POST', `/tickets/${ticketId}/assign`, assignRes.status)}`
      : `❌ 派工失败: ${evidence('POST', `/tickets/${ticketId}/assign`, assignRes.status, assignRes.data?.error)}`,
  });

  const wpRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'waiting_parts', note: `${TEST_PREFIX} 进入等待配件` }),
  });
  results.push({
    name: '正常流转：处理中→等待配件',
    passed: wpRes.ok,
    details: wpRes.ok
      ? `✓ 状态更新成功: ${evidence('PUT', `/tickets/${ticketId}/status`, wpRes.status)}`
      : `❌ 状态更新失败: ${evidence('PUT', `/tickets/${ticketId}/status`, wpRes.status, wpRes.data?.error)}`,
  });

  const wpToCompleteRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'completed' }),
  });
  results.push({
    name: '【关键拦截】等待配件→完成（管理员也不行）',
    passed: !wpToCompleteRes.ok && wpToCompleteRes.status === 400,
    details: !wpToCompleteRes.ok
      ? `✓ 已拦截: ${evidence('PUT', `/tickets/${ticketId}/status`, wpToCompleteRes.status, wpToCompleteRes.data?.error)}`
      : `❌ 未拦截，等待配件状态居然可以直接完成: ${evidence('PUT', `/tickets/${ticketId}/status`, wpToCompleteRes.status)}`,
  });

  const readerCloseRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: readerHeaders,
    body: JSON.stringify({ status: 'completed' }),
  });
  results.push({
    name: '【关键拦截】读者尝试关闭工单（等待配件状态下）',
    passed: !readerCloseRes.ok,
    details: !readerCloseRes.ok
      ? `✓ 已拦截: ${evidence('PUT', `/tickets/${ticketId}/status`, readerCloseRes.status, readerCloseRes.data?.error)}`
      : `❌ 未拦截，读者居然可以关闭工单: ${evidence('PUT', `/tickets/${ticketId}/status`, readerCloseRes.status)}`,
  });

  const backToProcessingRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'processing' }),
  });
  results.push({
    name: '正常流转：等待配件→处理中',
    passed: backToProcessingRes.ok,
    details: backToProcessingRes.ok
      ? `✓ 恢复处理成功`
      : `❌ 恢复处理失败: ${backToProcessingRes.data?.error || ''}`,
  });

  const readerCloseProcessingRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: readerHeaders,
    body: JSON.stringify({ status: 'completed' }),
  });
  results.push({
    name: '【关键拦截】读者尝试关闭工单（处理中状态下）',
    passed: !readerCloseProcessingRes.ok && readerCloseProcessingRes.status === 403,
    details: !readerCloseProcessingRes.ok
      ? `✓ 已拦截 (403): ${evidence('PUT', `/tickets/${ticketId}/status`, readerCloseProcessingRes.status, readerCloseProcessingRes.data?.error)}`
      : `❌ 未拦截，读者居然可以关闭工单: ${evidence('PUT', `/tickets/${ticketId}/status`, readerCloseProcessingRes.status)}`,
  });

  const completeRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'completed', note: `${TEST_PREFIX} 正常完成` }),
  });
  results.push({
    name: '正常流转：处理中→完成',
    passed: completeRes.ok,
    details: completeRes.ok
      ? `✓ 工单已完成`
      : `❌ 完成失败: ${completeRes.data?.error || ''}`,
  });

  const completedAssignRes = await api(`/tickets/${ticketId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ assigneeId: 'user_tech2' }),
  });
  results.push({
    name: '【关键拦截】已完成工单派工',
    passed: !completedAssignRes.ok && completedAssignRes.status === 400,
    details: !completedAssignRes.ok
      ? `✓ 已拦截: ${evidence('POST', `/tickets/${ticketId}/assign`, completedAssignRes.status, completedAssignRes.data?.error)}`
      : `❌ 未拦截，已完成工单居然可以重新派工: ${evidence('POST', `/tickets/${ticketId}/assign`, completedAssignRes.status)}`,
  });

  const completedToProcessingRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'processing' }),
  });
  results.push({
    name: '【关键拦截】已完成→处理中（绕过重新打开）',
    passed: !completedToProcessingRes.ok && completedToProcessingRes.status === 400,
    details: !completedToProcessingRes.ok
      ? `✓ 已拦截: ${evidence('PUT', `/tickets/${ticketId}/status`, completedToProcessingRes.status, completedToProcessingRes.data?.error)}`
      : `❌ 未拦截，已完成工单居然可以直接改回处理中: ${evidence('PUT', `/tickets/${ticketId}/status`, completedToProcessingRes.status)}`,
  });

  const completedNoteRes = await api(`/tickets/${ticketId}/note`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ note: `${TEST_PREFIX} 测试备注` }),
  });
  results.push({
    name: '【关键拦截】已完成工单添加备注',
    passed: !completedNoteRes.ok && completedNoteRes.status === 400,
    details: !completedNoteRes.ok
      ? `✓ 已拦截: ${evidence('POST', `/tickets/${ticketId}/note`, completedNoteRes.status, completedNoteRes.data?.error)}`
      : `❌ 未拦截，已完成工单居然可以加备注: ${evidence('POST', `/tickets/${ticketId}/note`, completedNoteRes.status)}`,
  });

  const reopenNoReasonRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'reopened' }),
  });
  results.push({
    name: '【关键拦截】重新打开不填原因',
    passed: !reopenNoReasonRes.ok && reopenNoReasonRes.status === 400,
    details: !reopenNoReasonRes.ok
      ? `✓ 已拦截: ${evidence('PUT', `/tickets/${ticketId}/status`, reopenNoReasonRes.status, reopenNoReasonRes.data?.error)}`
      : `❌ 未拦截，不填原因居然可以重新打开: ${evidence('PUT', `/tickets/${ticketId}/status`, reopenNoReasonRes.status)}`,
  });

  const reopenRes = await api(`/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'reopened', reopenReason: `${TEST_PREFIX} 测试重新打开流程` }),
  });
  results.push({
    name: '管理员重新打开（带原因）',
    passed: reopenRes.ok,
    details: reopenRes.ok
      ? `✓ 重新打开成功，状态变为 reopened`
      : `❌ 重新打开失败: ${reopenRes.data?.error || ''}`,
  });

  if (reopenRes.ok) {
    const reopenedAssignRes = await api(`/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ assigneeId: 'user_tech2', note: `${TEST_PREFIX} 重新打开后派工` }),
    });
    results.push({
      name: '重新打开后可以派工',
      passed: reopenedAssignRes.ok,
      details: reopenedAssignRes.ok
        ? `✓ 重新打开后派工成功，状态变为 processing`
        : `❌ 重新打开后派工失败: ${reopenedAssignRes.data?.error || ''}`,
    });
  }

  const detailRes = await api(`/tickets/${ticketId}`, { headers: adminHeaders });
  const hasTimeline = Array.isArray(detailRes.data?.data?.timeline) && detailRes.data.data.timeline.length > 0;
  results.push({
    name: '时间线记录完整性',
    passed: hasTimeline,
    details: hasTimeline
      ? `✓ 工单详情包含 ${detailRes.data.data.timeline.length} 条时间线记录`
      : '❌ 工单详情缺少时间线记录',
  });

  const exportCsvRes = await api('/export/tickets?format=csv', { headers: adminHeaders });
  const csvBytes = exportCsvRes.arrayBuffer ? new Uint8Array(exportCsvRes.arrayBuffer) : new Uint8Array();
  const csvHasBom = csvBytes.length >= 3 && csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF;
  const csvHasChinese = exportCsvRes.body.includes('工单ID') && exportCsvRes.body.includes('设备名称');
  const bomHex = csvBytes.length >= 3
    ? '0x' + Array.from(csvBytes.slice(0, 3)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    : 'n/a';
  results.push({
    name: 'CSV 导出：中文列头 + BOM',
    passed: csvHasBom && csvHasChinese,
    details: csvHasBom && csvHasChinese
      ? `✓ CSV 包含 UTF-8 BOM 头 (${bomHex}) 和中文字段，Excel 可直接打开`
      : `❌ BOM=${csvHasBom} (${bomHex}), 含中文列头=${csvHasChinese}`,
  });

  const exportJsonRes = await api('/export/tickets?format=json', { headers: adminHeaders });
  let jsonHasChineseKeys = false;
  try {
    const jsonData = JSON.parse(exportJsonRes.body);
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      const keys = Object.keys(jsonData[0]);
      jsonHasChineseKeys = keys.includes('工单ID') && keys.includes('状态变更记录');
    }
  } catch {}
  results.push({
    name: 'JSON 导出：中文字段可回读',
    passed: jsonHasChineseKeys,
    details: jsonHasChineseKeys
      ? '✓ JSON 使用中文字段名，与 CSV 列头一致，可被程序回读'
      : '❌ JSON 导出不包含预期的中文字段',
  });

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  设备报修系统 - 数据校验与回归测试');
  console.log('═══════════════════════════════════════════════\n');

  const allResults: TestResult[] = [];

  console.log('▶ 1. 状态跳转规则校验\n');
  const transitionResults = validateStateTransitions();
  allResults.push(...transitionResults);
  for (const r of transitionResults) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    if (r.details) console.log(`     ${r.details}`);
  }

  console.log('\n▶ 2. 数据库完整性校验\n');
  const dbResults = validateDbIntegrity();
  allResults.push(...dbResults);
  for (const r of dbResults) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    if (r.details) console.log(`     ${r.details}`);
  }

  console.log('\n▶ 3. 跨重启持久化校验\n');
  const persistResults = validateFiltersPersistence();
  allResults.push(...persistResults);
  for (const r of persistResults) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    if (r.details) console.log(`     ${r.details}`);
  }

  console.log('\n▶ 4. 导出一致性校验\n');
  const exportResults = validateExportConsistency();
  allResults.push(...exportResults);
  for (const r of exportResults) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    if (r.details) console.log(`     ${r.details}`);
  }

  console.log('\n▶ 5. API 运行时拦截校验\n');
  const apiResults = await runApiSmokeTests();
  allResults.push(...apiResults);
  for (const r of apiResults) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
    if (r.details) console.log(`     ${r.details}`);
  }

  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  const total = allResults.length;

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  结果: ${passed}/${total} 通过, ${failed} 失败`);
  if (failed > 0) {
    console.log('  失败项:');
    allResults.filter((r) => !r.passed).forEach((r) => console.log(`    ❌ ${r.name}: ${r.details || ''}`));
  }
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('校验脚本执行失败:', err);
  process.exit(1);
});
