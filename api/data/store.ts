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
      { id: 'pri_low', name: '低', color: '#6b7280', sort: 1 },
      { id: 'pri_medium', name: '中', color: '#3b82f6', sort: 2 },
      { id: 'pri_high', name: '高', color: '#f97316', sort: 3 },
      { id: 'pri_urgent', name: '紧急', color: '#ef4444', sort: 4 },
    ],
    tickets: [],
    timelineEvents: [],
  };
}

const VALID_STATUSES: TicketStatus[] = ['pending', 'processing', 'waiting_parts', 'paused', 'completed', 'reopened'];

function validateDatabase(db: Database): { fixed: number; warnings: string[] } {
  let fixed = 0;
  const warnings: string[] = [];

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
  return {
    ...ticket,
    asset,
    priority,
    submitter: submitter ? toPublicUser(submitter) : undefined,
    assignee: assignee ? toPublicUser(assignee) : undefined,
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
    db.tickets[index] = {
      ...db.tickets[index],
      ...updates,
      updatedAt: new Date().toISOString(),
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

export function persist(): void {
  saveDatabase(db);
}
