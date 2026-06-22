import { Router, type Response } from 'express';
import { getTickets, getTechnicians } from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { STATUS_LABELS } from '../../shared/types.js';

const router = Router();

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/tickets', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { startDate, endDate, status, format = 'csv' } = req.query;
  let tickets = getTickets();

  if (startDate) {
    tickets = tickets.filter((t) => new Date(t.createdAt) >= new Date(startDate as string));
  }
  if (endDate) {
    tickets = tickets.filter((t) => new Date(t.createdAt) <= new Date(endDate as string));
  }
  if (status) {
    tickets = tickets.filter((t) => t.status === status);
  }

  const technicians = getTechnicians();
  const techMap = new Map(technicians.map((t) => [t.id, t.name]));

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets_${Date.now()}.json"`);
    res.json(tickets);
    return;
  }

  const headers = [
    '工单ID',
    '设备名称',
    '设备编号',
    '位置',
    '问题描述',
    '优先级',
    '状态',
    '报修人',
    '处理人',
    '创建时间',
    '更新时间',
    '关闭时间',
    '重新打开原因',
  ];

  const rows = tickets.map((t) => [
    t.id,
    t.asset?.name || '',
    t.asset?.code || '',
    t.location,
    t.description,
    t.priority?.name || '',
    STATUS_LABELS[t.status] || t.status,
    t.submitter?.name || '',
    t.assignee?.name || (t.assigneeId ? techMap.get(t.assigneeId) || '' : ''),
    t.createdAt,
    t.updatedAt,
    t.closedAt || '',
    t.reopenReason || '',
  ]);

  const csvContent = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tickets_${Date.now()}.csv"`);
  res.send(bom + csvContent);
});

export default router;
