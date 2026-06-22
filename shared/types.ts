export type UserRole = 'reader' | 'technician' | 'admin';
export type TicketStatus = 'pending' | 'processing' | 'waiting_parts' | 'paused' | 'completed' | 'reopened';
export type TimelineEventType = 'created' | 'assigned' | 'status_changed' | 'note_added' | 'reopened' | 'escalated' | 'de_escalated' | 'escalation_exception_created' | 'escalation_exception_revoked' | 'batch_priority_changed' | 'batch_assignee_changed' | 'batch_exception_set' | 'batch_exception_revoked';

export type EscalationExceptionType = 'delay' | 'exempt';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface AssetGroup {
  id: string;
  name: string;
  icon: string;
  sort: number;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  type: string;
  location: string;
  groupId: string;
  createdAt: string;
}

export interface Priority {
  id: string;
  name: string;
  color: string;
  sort: number;
  responseTimeMinutes?: number;
  escalationOwnerId?: string;
}

export interface Ticket {
  id: string;
  assetId: string;
  asset?: Asset;
  location: string;
  description: string;
  priorityId: string;
  priority?: Priority;
  status: TicketStatus;
  submitterId: string;
  submitter?: PublicUser;
  assigneeId?: string;
  assignee?: PublicUser;
  reopenReason?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  isEscalated?: boolean;
  escalatedAt?: string;
  escalationReason?: string;
  escalationOwnerId?: string;
  escalationOwner?: PublicUser;
  escalationException?: EscalationException;
  escalationExceptions?: EscalationException[];
  version: number;
}

export interface TimelineEvent {
  id: string;
  ticketId: string;
  type: TimelineEventType;
  userId: string;
  user?: PublicUser;
  content: string;
  createdAt: string;
}

export interface EscalationRecord {
  id: string;
  ticketId: string;
  priorityId: string;
  responseTimeMinutesAtTrigger: number;
  escalatedAt: string;
  escalationReason: string;
  escalationOwnerId: string;
  originalAssigneeId?: string;
  deEscalatedAt?: string;
  deEscalatedBy?: string;
  deEscalationReason?: string;
}

export interface EscalationException {
  id: string;
  ticketId: string;
  type: EscalationExceptionType;
  reason: string;
  deadline: string;
  createdBy: string;
  createdAt: string;
  revokedBy?: string;
  revokedAt?: string;
  revokeReason?: string;
}

export interface Database {
  users: User[];
  assetGroups: AssetGroup[];
  assets: Asset[];
  priorities: Priority[];
  tickets: Ticket[];
  timelineEvents: TimelineEvent[];
  escalationRecords: EscalationRecord[];
  escalationExceptions: EscalationException[];
  batchOperations: PersistedBatchOperation[];
}

export interface TicketFilters {
  assetId?: string;
  location?: string;
  priorityId?: string;
  assigneeId?: string;
  status?: TicketStatus;
  groupId?: string;
  search?: string;
  isEscalated?: 'yes' | 'no' | '';
  hasException?: 'yes' | 'no' | '';
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending: '待派工',
  processing: '处理中',
  waiting_parts: '等待配件',
  paused: '已暂停',
  completed: '已完成',
  reopened: '重新打开',
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  waiting_parts: 'bg-purple-100 text-purple-700 border-purple-200',
  paused: 'bg-gray-100 text-gray-700 border-gray-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  reopened: 'bg-orange-100 text-orange-700 border-orange-200',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  reader: '读者/馆员',
  technician: '技术员',
  admin: '管理员',
};

export const KANBAN_COLUMNS: TicketStatus[] = ['pending', 'processing', 'waiting_parts', 'paused', 'reopened', 'completed'];

export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['processing'],
  processing: ['waiting_parts', 'paused', 'completed'],
  waiting_parts: ['processing', 'paused'],
  paused: ['processing'],
  completed: ['reopened'],
  reopened: ['processing', 'waiting_parts', 'paused', 'completed'],
};

export type BatchFailureType = 'permission_denied' | 'status_invalid' | 'version_conflict' | 'validation_error' | 'not_found';

export const BATCH_FAILURE_TYPE_LABELS: Record<BatchFailureType, string> = {
  permission_denied: '权限不足',
  status_invalid: '状态不允许',
  version_conflict: '并发更新冲突',
  validation_error: '校验失败',
  not_found: '工单不存在',
};

export interface BatchResultItem {
  ticketId: string;
  success: boolean;
  error?: string;
  failureType?: BatchFailureType;
  ticket?: Ticket;
}

export type BatchOperationType = 'priority' | 'assign' | 'exception_set' | 'exception_revoke';

export const BATCH_OPERATION_TYPE_LABELS: Record<BatchOperationType, string> = {
  priority: '批量修改优先级',
  assign: '批量派工',
  exception_set: '批量设置催办例外',
  exception_revoke: '批量撤销催办例外',
};

export interface PersistedBatchOperation {
  id: string;
  batchOperationId: string;
  operationType: BatchOperationType;
  operatorId: string;
  operatorName?: string;
  createdAt: string;
  requestBody: Record<string, unknown>;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchResultItem[];
}

export interface BatchOperationResult {
  batchOperationId: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchResultItem[];
  isReplayed?: boolean;
}

export interface BatchPriorityRequest {
  ticketIds: string[];
  priorityId: string;
  reason: string;
  expectedVersions?: Record<string, number>;
  batchOperationId?: string;
}

export interface BatchAssigneeRequest {
  ticketIds: string[];
  assigneeId: string;
  reason: string;
  expectedVersions?: Record<string, number>;
  batchOperationId?: string;
}

export interface BatchSetExceptionRequest {
  ticketIds: string[];
  type: EscalationExceptionType;
  reason: string;
  deadline: string;
  expectedVersions?: Record<string, number>;
  batchOperationId?: string;
}

export interface BatchRevokeExceptionRequest {
  ticketIds: string[];
  reason: string;
  expectedVersions?: Record<string, number>;
  batchOperationId?: string;
}
