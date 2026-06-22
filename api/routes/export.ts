import { Router, type Response } from 'express';
import { getTickets, getTechnicians, getTimelineEvents, getEscalationExceptionsByTicket, getBatchOperations } from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import { STATUS_LABELS, BATCH_OPERATION_TYPE_LABELS, BATCH_FAILURE_TYPE_LABELS } from '../../shared/types.js';

const router = Router();

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatStatusHistory(ticketId: string): string {
  const events = getTimelineEvents(ticketId);
  const statusEvents = events.filter(
    (e) => e.type === 'status_changed' || e.type === 'created' || e.type === 'reopened'
  );
  return statusEvents
    .map((e) => {
      const time = new Date(e.createdAt).toLocaleString('zh-CN', { hour12: false });
      return `[${time}] ${e.user?.name || '系统'}：${e.content}`;
    })
    .join('；');
}

function buildExportRow(t: ReturnType<typeof getTickets>[0], techMap: Map<string, string>) {
  const exceptions = getEscalationExceptionsByTicket(t.id);
  const activeException = exceptions.find((e) => !e.revokedAt && new Date(e.deadline).getTime() > Date.now());
  const exceptionHistory = exceptions
    .map((e) => {
      const status = e.revokedAt
        ? '已撤销'
        : new Date(e.deadline).getTime() <= Date.now()
          ? '已过期'
          : '生效中';
      const typeLabel = e.type === 'delay' ? '延后催办' : '免催办';
      return `[${new Date(e.createdAt).toLocaleString('zh-CN', { hour12: false })}] ${typeLabel}，${status}，原因：${e.reason}，截止：${new Date(e.deadline).toLocaleString('zh-CN', { hour12: false })}${e.revokedAt ? `，撤销时间：${new Date(e.revokedAt).toLocaleString('zh-CN', { hour12: false })}，撤销原因：${e.revokeReason}` : ''}`;
    })
    .join('；');

  return {
    工单ID: t.id,
    设备名称: t.asset?.name || '',
    设备编号: t.asset?.code || '',
    设备类型: t.asset?.type || '',
    位置: t.location,
    问题描述: t.description,
    优先级: t.priority?.name || '',
    状态: STATUS_LABELS[t.status] || t.status,
    报修人: t.submitter?.name || '',
    处理人: t.assignee?.name || (t.assigneeId ? techMap.get(t.assigneeId) || '' : ''),
    是否催办: t.isEscalated ? '是' : '否',
    催办时间: t.escalatedAt || '',
    升级原因: t.escalationReason || '',
    升级负责人: t.escalationOwner?.name || (t.escalationOwnerId ? techMap.get(t.escalationOwnerId) || '' : ''),
    催办例外状态: activeException ? (activeException.type === 'delay' ? '延后催办' : '免催办') : '无',
    催办例外原因: activeException?.reason || '',
    催办例外截止时间: activeException?.deadline || '',
    催办例外操作人: activeException ? (techMap.get(activeException.createdBy) || activeException.createdBy) : '',
    催办例外设置时间: activeException?.createdAt || '',
    催办例外历史: exceptionHistory || '',
    创建时间: t.createdAt,
    更新时间: t.updatedAt,
    关闭时间: t.closedAt || '',
    重新打开原因: t.reopenReason || '',
    状态变更记录: formatStatusHistory(t.id),
  };
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
    const rows = tickets.map((t) => buildExportRow(t, techMap));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''tickets_${Date.now()}.json`);
    res.json(rows);
    return;
  }

  const sampleRow = tickets.length > 0 ? buildExportRow(tickets[0], techMap) : null;
  const headers = sampleRow ? Object.keys(sampleRow) : [
    '工单ID', '设备名称', '设备编号', '设备类型', '位置', '问题描述',
    '优先级', '状态', '报修人', '处理人', '是否催办', '催办时间',
    '升级原因', '升级负责人', '催办例外状态', '催办例外原因',
    '催办例外截止时间', '催办例外操作人', '催办例外设置时间',
    '催办例外历史', '创建时间', '更新时间',
    '关闭时间', '重新打开原因', '状态变更记录',
  ];

  const rows = tickets.map((t) => {
    const row = buildExportRow(t, techMap);
    return headers.map((h) => row[h as keyof typeof row]);
  });

  const csvContent = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''tickets_${Date.now()}.csv`);
  res.send(bom + csvContent);
});

router.get('/batch-operations', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const operations = getBatchOperations();
  const { format = 'csv' } = req.query;

  const buildBatchRow = (op: ReturnType<typeof getBatchOperations>[0], item: typeof op.results[0]) => ({
    批量操作ID: op.batchOperationId,
    操作类型: BATCH_OPERATION_TYPE_LABELS[op.operationType] || op.operationType,
    操作人: op.operatorName || op.operatorId,
    操作时间: new Date(op.createdAt).toLocaleString('zh-CN', { hour12: false }),
    工单ID: item.ticketId,
    工单描述: item.ticket?.description || '',
    设备名称: item.ticket?.asset?.name || '',
    处理结果: item.success ? '成功' : '失败',
    失败类型: item.failureType ? (BATCH_FAILURE_TYPE_LABELS[item.failureType] || item.failureType) : '',
    失败原因: item.error || '',
    操作后优先级: item.ticket?.priority?.name || '',
    操作后处理人: item.ticket?.assignee?.name || '',
    操作后状态: item.ticket ? (STATUS_LABELS[item.ticket.status] || item.ticket.status) : '',
  });

  const rows: ReturnType<typeof buildBatchRow>[] = [];
  for (const op of operations) {
    for (const item of op.results) {
      rows.push(buildBatchRow(op, item));
    }
  }

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''batch_operations_${Date.now()}.json`);
    res.json(rows);
    return;
  }

  const sampleRow = rows.length > 0 ? rows[0] : null;
  const headers = sampleRow ? Object.keys(sampleRow) : [
    '批量操作ID', '操作类型', '操作人', '操作时间', '工单ID', '工单描述',
    '设备名称', '处理结果', '失败类型', '失败原因',
    '操作后优先级', '操作后处理人', '操作后状态',
  ];

  const csvRows = rows.map((row) => {
    return headers.map((h) => row[h as keyof typeof row]);
  });

  const csvContent = [headers, ...csvRows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''batch_operations_${Date.now()}.csv`);
  res.send(bom + csvContent);
});

export default router;
