import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Database,
  User,
  AssetGroup,
  Asset,
  Priority,
  Ticket,
  TimelineEvent,
  PublicUser,
  TicketStatus,
  EscalationRecord,
} from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function getInitialDatabase(): Database {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: 'user_admin',
        username: 'admin',
        password: 'admin123',
        name: '系统管理员',
        role: 'admin',
        createdAt: now,
      },
      {
        id: 'user_tech1',
        username: 'tech1',
        password: 'tech123',
        name: '张工程师',
        role: 'technician',
        createdAt: now,
      },
      {
        id: 'user_tech2',
        username: 'tech2',
        password: 'tech123',
        name: '李工程师',
        role: 'technician',
        createdAt: now,
      },
      {
        id: 'user_reader1',
        username: 'reader1',
        password: 'reader123',
        name: '王馆员',
        role: 'reader',
        createdAt: now,
      },
    ],
    assetGroups: [
      { id: 'grp_selfservice', name: '自助借还机', icon: 'Library', sort: 1 },
      { id: 'grp_access', name: '门禁系统', icon: 'DoorOpen', sort: 2 },
      { id: 'grp_computer', name: '公共电脑', icon: 'Monitor', sort: 3 },
      { id: 'grp_printer', name: '打印复印设备', icon: 'Printer', sort: 4 },
      { id: 'grp_other', name: '其他设备', icon: 'Settings', sort: 5 },
    ],
    assets: [
      {
        id: 'asset_001',
        code: 'LIB-SS-001',
        name: '一楼自助借还机A',
        type: '自助借还机',
        location: '图书馆一楼大厅',
        groupId: 'grp_selfservice',
        createdAt: now,
      },
      {
        id: 'asset_002',
        code: 'LIB-SS-002',
        name: '一楼自助借还机B',
        type: '自助借还机',
        location: '图书馆一楼大厅',
        groupId: 'grp_selfservice',
        createdAt: now,
      },
      {
        id: 'asset_003',
        code: 'LIB-SS-003',
        name: '二楼自助借还机',
        type: '自助借还机',
        location: '图书馆二楼服务台',
        groupId: 'grp_selfservice',
        createdAt: now,
      },
      {
        id: 'asset_004',
        code: 'LIB-AC-001',
        name: '正门门禁',
        type: '闸机门禁',
        location: '图书馆一楼正门',
        groupId: 'grp_access',
        createdAt: now,
      },
      {
        id: 'asset_005',
        code: 'LIB-AC-002',
        name: '侧门门禁',
        type: '刷卡门禁',
        location: '图书馆一楼侧门',
        groupId: 'grp_access',
        createdAt: now,
      },
      {
        id: 'asset_006',
        code: 'LIB-PC-001',
        name: '电子阅览室PC-01',
        type: '台式电脑',
        location: '图书馆三楼电子阅览室',
        groupId: 'grp_computer',
        createdAt: now,
      },
      {
        id: 'asset_007',
        code: 'LIB-PC-002',
        name: '电子阅览室PC-02',
        type: '台式电脑',
        location: '图书馆三楼电子阅览室',
        groupId: 'grp_computer',
        createdAt: now,
      },
      {
        id: 'asset_008',
        code: 'LIB-PC-003',
        name: '电子阅览室PC-03',
        type: '台式电脑',
        location: '图书馆三楼电子阅览室',
        groupId: 'grp_computer',
        createdAt: now,
      },
      {
        id: 'asset_009',
        code: 'LIB-PR-001',
        name: '一楼打印机',
        type: '多功能一体机',
        location: '图书馆一楼打印区',
        groupId: 'grp_printer',
        createdAt: now,
      },
      {
        id: 'asset_010',
        code: 'LIB-PR-002',
        name: '三楼打印机',
        type: '激光打印机',
        location: '图书馆三楼打印区',
        groupId: 'grp_printer',
        createdAt: now,
      },
    ],
    priorities: [
      { id: 'pri_low', name: '低', color: '#6b7280', sort: 1, responseTimeMinutes: 48 * 60, escalationOwnerId: 'user_admin' },
      { id: 'pri_medium', name: '中', color: '#3b82f6', sort: 2, responseTimeMinutes: 8 * 60, escalationOwnerId: 'user_admin' },
      { id: 'pri_high', name: '高', color: '#f97316', sort: 3, responseTimeMinutes: 2 * 60, escalationOwnerId: 'user_admin' },
      { id: 'pri_urgent', name: '紧急', color: '#ef4444', sort: 4, responseTimeMinutes: 15, escalationOwnerId: 'user_admin' },
    ],
    tickets: [],
    timelineEvents: [],
    escalationRecords: [],
  };
}

const VALID_STATUSES: TicketStatus[] = ['pending', 'processing', 'waiting_parts', 'paused', 'completed', 'reopened'];

function validateDatabase(db: Database): { fixed: number; warnings: string[] } {
  let fixed = 0;
  const warnings: string[] = [];

  if (!db.escalationRecords) {
    db.escalationRecords = [];
    warnings.push('数据库缺少 escalationRecords 表，已初始化空数组');
    fixed++;
  }

  for (const p of db.priorities) {
    if (p.responseTimeMinutes === undefined || p.responseTimeMinutes === null) {
      p.responseTimeMinutes = 0;
      warnings.push(`优先级 ${p.id} 缺少响应时限，已默认设为 0（不限时）`);
      fixed++;
    }
  }

  for (const ticket of db.tickets) {
    if (!VALID_STATUSES.includes(ticket.status)) {
      warnings.push(`工单 ${ticket.id} 状态异常「${ticket.status}」，已重置为 pending`);
      ticket.status = 'pending';
      fixed++;
    }

    if (ticket.status === 'completed' && !ticket.closedAt) {
      ticket.closedAt = ticket.updatedAt;
      warnings.push(`工单 ${ticket.id} 已完成但缺少关闭时间，已用更新时间填充`);
      fixed++;
    }

    if (ticket.status !== 'completed' && ticket.closedAt) {
      warnings.push(`工单 ${ticket.id} 状态为「${ticket.status}」但存在关闭时间，已清除`);
      ticket.closedAt = undefined;
      fixed++;
    }

    if (ticket.status === 'reopened' && !ticket.reopenReason) {
      ticket.reopenReason = '（系统重建：原重新打开原因丢失）';
      warnings.push(`工单 ${ticket.id} 重新打开但缺少原因，已填充默认文本`);
      fixed++;
    }

    if (ticket.status === 'completed' && ticket.isEscalated) {
      ticket.isEscalated = false;
      ticket.escalatedAt = undefined;
      ticket.escalationReason = undefined;
      ticket.escalationOwnerId = undefined;
      warnings.push(`工单 ${ticket.id} 已完成但仍带催办标记，已清除`);
      fixed++;
    }

    if (ticket.isEscalated && !ticket.escalatedAt) {
      ticket.isEscalated = false;
      ticket.escalationReason = undefined;
      ticket.escalationOwnerId = undefined;
      warnings.push(`工单 ${ticket.id} 催办标记异常缺少时间，已复位`);
      fixed++;
    }

    if (ticket.escalationOwnerId && !db.users.find((u) => u.id === ticket.escalationOwnerId)) {
      warnings.push(`工单 ${ticket.id} 引用的升级负责人 ${ticket.escalationOwnerId} 不存在`);
    }

    if (!db.assets.find((a) => a.id === ticket.assetId)) {
      warnings.push(`工单 ${ticket.id} 引用的资产 ${ticket.assetId} 不存在`);
    }

    if (!db.priorities.find((p) => p.id === ticket.priorityId)) {
      warnings.push(`工单 ${ticket.id} 引用的优先级 ${ticket.priorityId} 不存在`);
    }

    if (ticket.assigneeId && !db.users.find((u) => u.id === ticket.assigneeId)) {
      warnings.push(`工单 ${ticket.id} 引用的处理人 ${ticket.assigneeId} 不存在，已清除`);
      ticket.assigneeId = undefined;
      fixed++;
    }

    if (!db.users.find((u) => u.id === ticket.submitterId)) {
      warnings.push(`工单 ${ticket.id} 引用的提交人 ${ticket.submitterId} 不存在`);
    }
  }

  const ticketIds = new Set(db.tickets.map((t) => t.id));
  for (const event of db.timelineEvents) {
    if (!ticketIds.has(event.ticketId)) {
      warnings.push(`时间线事件 ${event.id} 引用的工单 ${event.ticketId} 不存在`);
    }
    if (!db.users.find((u) => u.id === event.userId)) {
      warnings.push(`时间线事件 ${event.id} 引用的用户 ${event.userId} 不存在`);
    }
  }

  for (const rec of db.escalationRecords) {
    if (!ticketIds.has(rec.ticketId)) {
      warnings.push(`催办记录 ${rec.id} 引用的工单 ${rec.ticketId} 不存在`);
    }
    if (!db.priorities.find((p) => p.id === rec.priorityId)) {
      warnings.push(`催办记录 ${rec.id} 引用的优先级 ${rec.priorityId} 不存在`);
    }
    if (!db.users.find((u) => u.id === rec.escalationOwnerId)) {
      warnings.push(`催办记录 ${rec.id} 引用的升级负责人 ${rec.escalationOwnerId} 不存在`);
    }
    if (rec.deEscalatedBy && !db.users.find((u) => u.id === rec.deEscalatedBy)) {
      warnings.push(`催办记录 ${rec.id} 引用的撤销人 ${rec.deEscalatedBy} 不存在`);
    }
  }

  return { fixed, warnings };
}

function loadDatabase(): Database {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const db = JSON.parse(data) as Database;
      const result = validateDatabase(db);
      if (result.fixed > 0 || result.warnings.length > 0) {
        if (result.warnings.length > 0) {
          console.warn('[DB Validation] 数据校验发现问题：');
          result.warnings.forEach((w) => console.warn(`  - ${w}`));
        }
        if (result.fixed > 0) {
          console.warn(`[DB Validation] 已自动修复 ${result.fixed} 项异常`);
          saveDatabase(db);
        }
      }
      return db;
    }
  } catch (error) {
    console.error('Error loading database, using initial data:', error);
  }
  const initialDb = getInitialDatabase();
  saveDatabase(initialDb);
  return initialDb;
}

function saveDatabase(db: Database): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

let db: Database = loadDatabase();

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}

export function getUsers(): User[] {
  return db.users;
}

export function findUserByUsername(username: string): User | undefined {
  return db.users.find((u) => u.username === username);
}

export function findUserById(id: string): User | undefined {
  return db.users.find((u) => u.id === id);
}

export function getTechnicians(): PublicUser[] {
  return db.users
    .filter((u) => u.role === 'technician' || u.role === 'admin')
    .map(toPublicUser);
}

export function getAssetGroups(): AssetGroup[] {
  return [...db.assetGroups].sort((a, b) => a.sort - b.sort);
}

export function getAssets(): Asset[] {
  return db.assets;
}

export function createAsset(asset: Omit<Asset, 'id' | 'createdAt'>): Asset {
  const newAsset: Asset = {
    ...asset,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  db.assets.push(newAsset);
  saveDatabase(db);
  return newAsset;
}

export function updateAsset(id: string, updates: Partial<Asset>): Asset | undefined {
  const index = db.assets.findIndex((a) => a.id === id);
  if (index !== -1) {
    db.assets[index] = { ...db.assets[index], ...updates };
    saveDatabase(db);
    return db.assets[index];
  }
  return undefined;
}

export function deleteAsset(id: string): boolean {
  const index = db.assets.findIndex((a) => a.id === id);
  if (index !== -1) {
    db.assets.splice(index, 1);
    saveDatabase(db);
    return true;
  }
  return false;
}

export function getPriorities(): Priority[] {
  return [...db.priorities].sort((a, b) => a.sort - b.sort);
}

export function updatePriorities(priorities: Priority[]): Priority[] {
  db.priorities = priorities;
  saveDatabase(db);
  return db.priorities;
}

export function getTickets(): Ticket[] {
  return db.tickets.map(enrichTicket);
}

function enrichTicket(ticket: Ticket): Ticket {
  const asset = db.assets.find((a) => a.id === ticket.assetId);
  const priority = db.priorities.find((p) => p.id === ticket.priorityId);
  const submitter = db.users.find((u) => u.id === ticket.submitterId);
  const assignee = ticket.assigneeId ? db.users.find((u) => u.id === ticket.assigneeId) : undefined;
  const escalationOwner = ticket.escalationOwnerId
    ? db.users.find((u) => u.id === ticket.escalationOwnerId)
    : undefined;
  return {
    ...ticket,
    asset,
    priority,
    submitter: submitter ? toPublicUser(submitter) : undefined,
    assignee: assignee ? toPublicUser(assignee) : undefined,
    escalationOwner: escalationOwner ? toPublicUser(escalationOwner) : undefined,
  };
}

export function getTicketById(id: string): Ticket | undefined {
  const ticket = db.tickets.find((t) => t.id === id);
  return ticket ? enrichTicket(ticket) : undefined;
}

export function createTicket(
  data: Omit<Ticket, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'submitterId'>,
  submitterId: string
): Ticket {
  const now = new Date().toISOString();
  const newTicket: Ticket = {
    ...data,
    id: generateId(),
    status: 'pending',
    submitterId,
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.push(newTicket);
  addTimelineEvent({
    ticketId: newTicket.id,
    type: 'created',
    userId: submitterId,
    content: '创建了报修工单',
  });
  saveDatabase(db);
  return enrichTicket(newTicket);
}

export function updateTicket(id: string, updates: Partial<Ticket>): Ticket | undefined {
  const index = db.tickets.findIndex((t) => t.id === id);
  if (index !== -1) {
    const finalUpdates: Partial<Ticket> = { ...updates, updatedAt: new Date().toISOString() };
    if (finalUpdates.status === 'completed') {
      finalUpdates.isEscalated = false;
      finalUpdates.escalatedAt = undefined;
      finalUpdates.escalationReason = undefined;
      finalUpdates.escalationOwnerId = undefined;
    }
    if (finalUpdates.status === 'reopened') {
      finalUpdates.isEscalated = false;
      finalUpdates.escalatedAt = undefined;
      finalUpdates.escalationReason = undefined;
      finalUpdates.escalationOwnerId = undefined;
    }
    db.tickets[index] = {
      ...db.tickets[index],
      ...finalUpdates,
    };
    saveDatabase(db);
    return enrichTicket(db.tickets[index]);
  }
  return undefined;
}

export function getTimelineEvents(ticketId: string): TimelineEvent[] {
  return db.timelineEvents
    .filter((e) => e.ticketId === ticketId)
    .map((e) => {
      const user = db.users.find((u) => u.id === e.userId);
      return {
        ...e,
        user: user ? toPublicUser(user) : undefined,
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addTimelineEvent(
  data: Omit<TimelineEvent, 'id' | 'createdAt'>
): TimelineEvent {
  const event: TimelineEvent = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  db.timelineEvents.push(event);
  return event;
}

export function getEscalationRecordsByTicket(ticketId: string): EscalationRecord[] {
  return db.escalationRecords.filter((r) => r.ticketId === ticketId);
}

export function checkAndTriggerEscalation(ticketId: string): { triggered: boolean; reason?: string } {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) return { triggered: false, reason: '工单不存在' };
  if (ticket.status === 'completed') return { triggered: false, reason: '已完成工单不触发催办' };
  if (ticket.isEscalated) return { triggered: false, reason: '已处于催办状态' };

  const priority = db.priorities.find((p) => p.id === ticket.priorityId);
  if (!priority || !priority.responseTimeMinutes || priority.responseTimeMinutes <= 0) {
    return { triggered: false, reason: '优先级未配置时限或不限时' };
  }

  const created = new Date(ticket.createdAt).getTime();
  const now = Date.now();
  const elapsedMinutes = (now - created) / 60000;
  if (elapsedMinutes < priority.responseTimeMinutes) {
    return { triggered: false, reason: `未超时，已过 ${Math.floor(elapsedMinutes)} 分钟，时限 ${priority.responseTimeMinutes} 分钟` };
  }

  const escalationOwnerId = priority.escalationOwnerId || 'user_admin';
  const owner = db.users.find((u) => u.id === escalationOwnerId);
  const ownerName = owner ? owner.name : '管理员';
  const originalAssigneeId = ticket.assigneeId;

  ticket.isEscalated = true;
  ticket.escalatedAt = new Date().toISOString();
  ticket.escalationOwnerId = escalationOwnerId;
  ticket.escalationReason = `优先级「${priority.name}」响应时限为 ${priority.responseTimeMinutes} 分钟，工单创建 ${Math.floor(elapsedMinutes)} 分钟仍未处理完成，自动升级由 ${ownerName} 督办`;
  ticket.updatedAt = ticket.escalatedAt;

  const record: EscalationRecord = {
    id: generateId(),
    ticketId: ticket.id,
    priorityId: priority.id,
    escalatedAt: ticket.escalatedAt,
    escalationReason: ticket.escalationReason,
    escalationOwnerId,
    originalAssigneeId,
  };
  db.escalationRecords.push(record);

  const duplicateType = 'escalated';
  const recentSameType = db.timelineEvents
    .filter((e) => e.ticketId === ticket.id && e.type === duplicateType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (recentSameType.length === 0 || new Date(recentSameType[0].createdAt).getTime() < now - 1000) {
    db.timelineEvents.push({
      id: generateId(),
      ticketId: ticket.id,
      type: 'escalated',
      userId: escalationOwnerId,
      content: ticket.escalationReason,
      createdAt: ticket.escalatedAt,
    });
  }

  saveDatabase(db);
  return { triggered: true };
}

export function checkAllEscalations(): number {
  let count = 0;
  const openTickets = db.tickets.filter((t) => t.status !== 'completed' && !t.isEscalated);
  for (const t of openTickets) {
    const result = checkAndTriggerEscalation(t.id);
    if (result.triggered) count++;
  }
  return count;
}

export function deEscalateTicket(
  ticketId: string,
  operatorId: string,
  reason: string
): { success: boolean; ticket?: Ticket; error?: string } {
  const index = db.tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) return { success: false, error: '工单不存在' };
  const ticket = db.tickets[index];
  if (!ticket.isEscalated) return { success: false, error: '工单当前未处于催办状态' };

  const escalatedAt = ticket.escalatedAt!;
  const escalationOwnerId = ticket.escalationOwnerId!;
  const escalationReason = ticket.escalationReason!;

  ticket.isEscalated = false;
  ticket.escalatedAt = undefined;
  ticket.escalationReason = undefined;
  ticket.escalationOwnerId = undefined;
  ticket.updatedAt = new Date().toISOString();

  const openRecord = db.escalationRecords.find(
    (r) =>
      r.ticketId === ticketId &&
      r.escalatedAt === escalatedAt &&
      r.escalationOwnerId === escalationOwnerId &&
      !r.deEscalatedAt
  );
  if (openRecord) {
    openRecord.deEscalatedAt = ticket.updatedAt;
    openRecord.deEscalatedBy = operatorId;
    openRecord.deEscalationReason = reason;
  }

  const operator = db.users.find((u) => u.id === operatorId);
  const operatorName = operator ? operator.name : '管理员';
  const content = `管理员 ${operatorName} 撤销本次催办，原因：${reason}（原升级原因：${escalationReason}）`;
  db.timelineEvents.push({
    id: generateId(),
    ticketId: ticket.id,
    type: 'de_escalated',
    userId: operatorId,
    content,
    createdAt: ticket.updatedAt,
  });

  saveDatabase(db);
  return { success: true, ticket: enrichTicket(ticket) };
}

export function persist(): void {
  saveDatabase(db);
}
