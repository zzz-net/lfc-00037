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
} from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import type { TicketStatus, TimelineEventType } from '../../shared/types.js';

const router = Router();

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['processing'],
  processing: ['waiting_parts', 'paused', 'completed'],
  waiting_parts: ['processing', 'paused', 'completed'],
  paused: ['processing'],
  completed: ['reopened'],
  reopened: ['processing', 'waiting_parts', 'paused', 'completed'],
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: '待派工',
  processing: '处理中',
  waiting_parts: '等待配件',
  paused: '已暂停',
  completed: '已完成',
  reopened: '重新打开',
};

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response): void => {
  const { assetId, location, priorityId, assigneeId, status, groupId, search } = req.query;
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

  tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ success: true, data: { tickets, total: tickets.length } });
});

router.get('/:id', (req: AuthRequest, res: Response): void => {
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
  res.json({ success: true, data: { ticket, timeline } });
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

router.post('/:id/assign', requireRoles('admin', 'technician'), (req: AuthRequest, res: Response): void => {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
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
});

router.put('/:id/status', (req: AuthRequest, res: Response): void => {
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

  if (targetStatus === 'completed' && ticket.status === 'waiting_parts' && user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: '「等待配件」状态的工单需要管理员权限才能直接完成',
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
});

router.post('/:id/note', (req: AuthRequest, res: Response): void => {
  const ticket = getTicketById(req.params.id);
  if (!ticket) {
    res.status(404).json({ success: false, error: '工单不存在' });
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

export default router;
