import { Router, type Response } from 'express';
import {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  getTimelineEvents,
  addTimelineEvent,
  findUserById,
  getAssets,
  getPriorities,
  persist,
  checkAllEscalations,
  deEscalateTicket,
  getEscalationRecordsByTicket,
  createEscalationException,
  revokeEscalationException,
  getEscalationExceptionsByTicket,
  batchChangePriority,
  batchChangeAssignee,
  batchSetEscalationException,
  batchRevokeEscalationException,
  getBatchOperations,
  getBatchOperationByBatchId,
} from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { STATUS_TRANSITIONS, STATUS_LABELS } from '../../shared/types.js';
import type { TicketStatus, TimelineEventType } from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response): void => {
  checkAllEscalations();
  const { assetId, location, priorityId, assigneeId, status, groupId, search, isEscalated, hasException } = req.query;
  let tickets = getTickets();

  const user = req.user!;
  if (user.role === 'reader') {
    tickets = tickets.filter((t) => t.submitterId === user.id);
  } else if (user.role === 'technician') {
    tickets = tickets.filter((t) => t.submitterId === user.id || t.assigneeId === user.id || !t.assigneeId);
  }

  if (assetId) {
    tickets = tickets.filter((t) => t.assetId === assetId);
  }
  if (location) {
    tickets = tickets.filter((t) => t.location.includes(location as string));
  }
  if (priorityId) {
    tickets = tickets.filter((t) => t.priorityId === priorityId);
  }
  if (assigneeId) {
    if (assigneeId === 'unassigned') {
      tickets = tickets.filter((t) => !t.assigneeId);
    } else {
      tickets = tickets.filter((t) => t.assigneeId === assigneeId);
    }
  }
  if (status) {
    tickets = tickets.filter((t) => t.status === status);
  }
  if (groupId) {
    tickets = tickets.filter((t) => t.asset?.groupId === groupId);
  }
  if (search) {
    const s = (search as string).toLowerCase();
    tickets = tickets.filter(
      (t) =>
        t.description.toLowerCase().includes(s) ||
        t.asset?.name.toLowerCase().includes(s) ||
        t.asset?.code.toLowerCase().includes(s)
    );
  }
  if (isEscalated === 'yes') {
    tickets = tickets.filter((t) => t.isEscalated);
  } else if (isEscalated === 'no') {
    tickets = tickets.filter((t) => !t.isEscalated);
  }
  if (hasException === 'yes') {
    tickets = tickets.filter((t) => t.escalationException);
  } else if (hasException === 'no') {
    tickets = tickets.filter((t) => !t.escalationException);
  }

  tickets.sort((a, b) => {
    const aEsc = a.isEscalated ? 1 : 0;
    const bEsc = b.isEscalated ? 1 : 0;
    if (aEsc !== bEsc) return bEsc - aEsc;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  res.json({ success: true, data: { tickets, total: tickets.length } });
});

router.get('/:id', (req: AuthRequest, res: Response): void => {
  checkAllEscalations();
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
    return;
  }
  const user = req.user!;
  if (user.role === 'reader' && ticket.submitterId !== user.id) {
    res.status(403).json({ success: false, error: '权限不足' });
    return;
  }
  const timeline = getTimelineEvents(ticket.id);
  const escalationRecords = getEscalationRecordsByTicket(ticket.id);
  const escalationExceptions = getEscalationExceptionsByTicket(ticket.id);
  res.json({ success: true, data: { ticket, timeline, escalationRecords, escalationExceptions } });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { assetId, location, description, priorityId } = req.body;
  const errors: string[] = [];

  if (!assetId) errors.push('请选择报修设备');
  if (!location || !location.trim()) errors.push('请填写位置信息');
  if (!description || description.trim().length < 10) errors.push('问题描述至少需要10个字符');
  if (!priorityId) errors.push('请选择优先级');

  const assets = getAssets();
  if (assetId && !assets.find((a) => a.id === assetId)) {
    errors.push('选择的设备不存在');
  }

  const priorities = getPriorities();
  if (priorityId && !priorities.find((p) => p.id === priorityId)) {
    errors.push('选择的优先级不存在');
  }

  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join('；') });
    return;
  }

  const user = req.user!;
  const ticket = createTicket(
    {
      assetId,
      location: location.trim(),
      description: description.trim(),
      priorityId,
    },
    user.id
  );
  persist();
  res.status(201).json({ success: true, data: { ticket } });
});

// ===== 批量操作（必须放在 /:id/* 路由之前，否则 batch 会被当作 :id 参数匹配） =====
router.post('/batch/priority', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { ticketIds, priorityId, reason, expectedVersions, batchOperationId } = req.body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    res.status(400).json({ success: false, error: '请选择要处理的工单' });
    return;
  }
  if (!priorityId) {
    res.status(400).json({ success: false, error: '请选择目标优先级' });
    return;
  }
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写操作原因' });
    return;
  }
  const priorities = getPriorities();
  if (!priorities.find((p) => p.id === priorityId)) {
    res.status(400).json({ success: false, error: '选择的优先级不存在' });
    return;
  }
  const user = req.user!;
  const result = batchChangePriority(
    ticketIds,
    priorityId,
    String(reason).trim(),
    user.id,
    expectedVersions as Record<string, number> | undefined,
    batchOperationId as string | undefined
  );
  persist();
  checkAllEscalations();
  res.json({ success: true, data: result });
});

router.post('/batch/assign', requireRoles('admin', 'technician'), (req: AuthRequest, res: Response): void => {
  const { ticketIds, assigneeId, reason, expectedVersions, batchOperationId } = req.body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    res.status(400).json({ success: false, error: '请选择要处理的工单' });
    return;
  }
  if (!assigneeId) {
    res.status(400).json({ success: false, error: '请选择处理人' });
    return;
  }
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写操作原因' });
    return;
  }
  const assignee = findUserById(assigneeId);
  if (!assignee || (assignee.role !== 'technician' && assignee.role !== 'admin')) {
    res.status(400).json({ success: false, error: '处理人必须是技术员或管理员' });
    return;
  }
  const user = req.user!;
  const result = batchChangeAssignee(
    ticketIds,
    assigneeId,
    String(reason).trim(),
    user.id,
    expectedVersions as Record<string, number> | undefined,
    batchOperationId as string | undefined
  );
  persist();
  checkAllEscalations();
  res.json({ success: true, data: result });
});

router.post('/batch/exception', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { ticketIds, type, reason, deadline, expectedVersions, batchOperationId } = req.body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    res.status(400).json({ success: false, error: '请选择要处理的工单' });
    return;
  }
  if (!type || (type !== 'delay' && type !== 'exempt')) {
    res.status(400).json({ success: false, error: '例外类型必须为 delay（延后催办）或 exempt（免催办）' });
    return;
  }
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写设置例外的原因' });
    return;
  }
  if (!deadline) {
    res.status(400).json({ success: false, error: '必须设置截止时间' });
    return;
  }
  const user = req.user!;
  const result = batchSetEscalationException(
    ticketIds,
    type,
    String(reason).trim(),
    deadline,
    user.id,
    expectedVersions as Record<string, number> | undefined,
    batchOperationId as string | undefined
  );
  persist();
  checkAllEscalations();
  res.json({ success: true, data: result });
});

router.post('/batch/exception/revoke', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { ticketIds, reason, expectedVersions, batchOperationId } = req.body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    res.status(400).json({ success: false, error: '请选择要处理的工单' });
    return;
  }
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写撤销例外的原因' });
    return;
  }
  const user = req.user!;
  const result = batchRevokeEscalationException(
    ticketIds,
    String(reason).trim(),
    user.id,
    expectedVersions as Record<string, number> | undefined,
    batchOperationId as string | undefined
  );
  persist();
  checkAllEscalations();
  res.json({ success: true, data: result });
});

// ===== 批量操作查询（管理员可见） =====
router.get('/batch/operations', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const operations = getBatchOperations();
  res.json({ success: true, data: { operations, total: operations.length } });
});

router.get('/batch/operations/:batchOperationId', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const operation = getBatchOperationByBatchId(req.params.batchOperationId);
  if (!operation) {
    res.status(404).json({ success: false, error: '批量操作记录不存在' });
    return;
  }
  res.json({ success: true, data: { operation } });
});

router.post('/:id/note', (req: AuthRequest, res: Response): void => {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
    return;
  }
  if (ticket.status === 'completed') {
    res.status(400).json({
      success: false,
      error: '已完成的工单不能添加备注，请先由管理员重新打开后再操作',
    });
    return;
  }
  const { note } = req.body;
  if (!note || !note.trim()) {
    res.status(400).json({ success: false, error: '备注内容不能为空' });
    return;
  }
  const user = req.user!;
  addTimelineEvent({
    ticketId: ticket.id,
    type: 'note_added',
    userId: user.id,
    content: note.trim(),
  });
  persist();
  const timeline = getTimelineEvents(ticket.id);
  res.json({ success: true, data: { timeline } });
});

const ESCALATION_FORBIDDEN_KEYS = ['isEscalated', 'escalatedAt', 'escalationReason', 'escalationOwnerId', 'escalationOwner'];
function hasEscalationFields(obj: Record<string, unknown> | undefined | null): string | null {
  if (!obj) return null;
  for (const k of Object.keys(obj)) {
    if (ESCALATION_FORBIDDEN_KEYS.includes(k)) return k;
  }
  return null;
}

router.put('/:id/status', (req: AuthRequest, res: Response): void => {
  const forbidden = hasEscalationFields(req.body);
  if (forbidden) {
    res.status(403).json({
      success: false,
      error: `不允许手动修改催办字段「${forbidden}」，催办由系统按优先级时限自动触发，仅管理员可通过撤销接口操作`,
    });
    return;
  }
  // existing logic continues below - we'll replace the original
  _handleStatusChange(req, res);
});

function _handleStatusChange(req: AuthRequest, res: Response): void {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
    return;
  }
  const user = req.user!;
  const { status, note, reopenReason } = req.body;
  const targetStatus = status as TicketStatus;

  if (!targetStatus) {
    res.status(400).json({ success: false, error: '请指定目标状态' });
    return;
  }

  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] || [];
  if (!allowedTransitions.includes(targetStatus)) {
    res.status(400).json({
      success: false,
      error: `不允许从「${STATUS_LABELS[ticket.status]}」直接变更为「${STATUS_LABELS[targetStatus]}」`,
    });
    return;
  }

  if (targetStatus === 'completed' && ticket.status === 'waiting_parts') {
    res.status(400).json({
      success: false,
      error: '「等待配件」状态的工单不能直接完成，请先恢复为「处理中」或「已暂停」后再完成',
    });
    return;
  }

  if (targetStatus === 'completed' && user.role === 'reader') {
    res.status(403).json({ success: false, error: '读者/馆员无权关闭工单，请联系管理员或技术员' });
    return;
  }

  if (targetStatus === 'reopened') {
    if (user.role !== 'admin') {
      res.status(403).json({ success: false, error: '只有管理员可以重新打开已完成的工单' });
      return;
    }
    if (!reopenReason || !reopenReason.trim()) {
      res.status(400).json({ success: false, error: '重新打开工单必须填写原因' });
      return;
    }
  }

  const updates: Partial<typeof ticket> = { status: targetStatus };
  if (targetStatus === 'completed') {
    updates.closedAt = new Date().toISOString();
  }
  if (targetStatus === 'reopened') {
    updates.reopenReason = reopenReason.trim();
    updates.closedAt = undefined;
  }

  const updated = updateTicket(ticket.id, updates);

  let eventType: TimelineEventType = 'status_changed';
  let content = `状态从 ${STATUS_LABELS[ticket.status]} 变更为 ${STATUS_LABELS[targetStatus]}`;
  if (targetStatus === 'reopened') {
    eventType = 'reopened';
    content = `重新打开工单，原因：${reopenReason.trim()}`;
  }
  if (note && note.trim()) {
    content += `（备注：${note.trim()}）`;
  }

  addTimelineEvent({
    ticketId: ticket.id,
    type: eventType,
    userId: user.id,
    content,
  });
  persist();
  res.json({ success: true, data: { ticket: updated } });
}

router.post('/:id/assign', requireRoles('admin', 'technician'), (req: AuthRequest, res: Response): void => {
  const forbidden = hasEscalationFields(req.body);
  if (forbidden) {
    res.status(403).json({
      success: false,
      error: `不允许通过派工接口修改催办字段「${forbidden}」`,
    });
    return;
  }
  return _handleAssign(req, res);
});

function _handleAssign(req: AuthRequest, res: Response): void {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
    return;
  }

  if (ticket.status === 'completed') {
    res.status(400).json({
      success: false,
      error: '已完成的工单不能直接派工，请先由管理员重新打开并填写原因后再派工',
    });
    return;
  }

  if (ticket.status !== 'pending' && ticket.status !== 'reopened') {
    res.status(400).json({
      success: false,
      error: `当前状态「${STATUS_LABELS[ticket.status]}」不允许派工，只有待派工或重新打开的工单可以派工`,
    });
    return;
  }

  const { assigneeId, note } = req.body;
  if (!assigneeId) {
    res.status(400).json({ success: false, error: '请选择处理人' });
    return;
  }
  const assignee = findUserById(assigneeId);
  if (!assignee || (assignee.role !== 'technician' && assignee.role !== 'admin')) {
    res.status(400).json({ success: false, error: '处理人必须是技术员或管理员' });
    return;
  }

  const user = req.user!;
  const updated = updateTicket(ticket.id, { assigneeId, status: 'processing' });
  addTimelineEvent({
    ticketId: ticket.id,
    type: 'assigned',
    userId: user.id,
    content: `将工单派给 ${assignee.name}${note ? `：${note}` : ''}`,
  });
  addTimelineEvent({
    ticketId: ticket.id,
    type: 'status_changed',
    userId: user.id,
    content: `状态从 ${STATUS_LABELS[ticket.status]} 变更为 ${STATUS_LABELS.processing}`,
  });
  persist();
  res.json({ success: true, data: { ticket: updated } });
}

router.post('/:id/escalation-exception', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { type, reason, deadline } = req.body;
  if (!type || (type !== 'delay' && type !== 'exempt')) {
    res.status(400).json({ success: false, error: '例外类型必须为 delay（延后催办）或 exempt（免催办）' });
    return;
  }
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写设置例外的原因' });
    return;
  }
  if (!deadline) {
    res.status(400).json({ success: false, error: '必须设置截止时间' });
    return;
  }
  const user = req.user!;
  const result = createEscalationException(req.params.id, type, String(reason).trim(), deadline, user.id);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  persist();
  const ticket = getTicketById(req.params.id);
  const timeline = getTimelineEvents(req.params.id);
  const escalationRecords = getEscalationRecordsByTicket(req.params.id);
  const escalationExceptions = getEscalationExceptionsByTicket(req.params.id);
  res.json({
    success: true,
    data: { ticket, timeline, escalationRecords, escalationExceptions },
  });
});

router.delete('/:id/escalation-exception', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '必须填写撤销例外的原因' });
    return;
  }
  const user = req.user!;
  const result = revokeEscalationException(req.params.id, String(reason).trim(), user.id);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  persist();
  const ticket = getTicketById(req.params.id);
  const timeline = getTimelineEvents(req.params.id);
  const escalationRecords = getEscalationRecordsByTicket(req.params.id);
  const escalationExceptions = getEscalationExceptionsByTicket(req.params.id);
  res.json({
    success: true,
    data: { ticket, timeline, escalationRecords, escalationExceptions },
  });
});

router.post('/:id/de-escalate', requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    res.status(400).json({ success: false, error: '撤销催办必须填写原因' });
    return;
  }
  const user = req.user!;
  const result = deEscalateTicket(req.params.id, user.id, String(reason).trim());
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  persist();
  const timeline = getTimelineEvents(req.params.id);
  const escalationRecords = getEscalationRecordsByTicket(req.params.id);
  res.json({
    success: true,
    data: { ticket: result.ticket, timeline, escalationRecords },
  });
});

export default router;
