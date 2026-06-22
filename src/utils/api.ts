import type {
  PublicUser,
  Ticket,
  TimelineEvent,
  Asset,
  AssetGroup,
  Priority,
  TicketFilters,
  TicketStatus,
  EscalationException,
  BatchOperationResult,
  EscalationExceptionType,
} from '../../shared/types';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const token = getAuthToken();
  if (token) {
    headers['x-user-id'] = token;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let result: ApiResponse<T>;
  try {
    result = text ? JSON.parse(text) : { success: response.ok };
  } catch {
    result = { success: response.ok, data: text as unknown as T };
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error || `请求失败 (${response.status})`);
  }

  return result.data as T;
}

export async function login(username: string, password: string) {
  return request<{ token: string; user: PublicUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getCurrentUser() {
  return request<{ user: PublicUser }>('/auth/me');
}

export async function getTickets(filters: TicketFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return request<{ tickets: Ticket[]; total: number }>(
    `/tickets${query ? `?${query}` : ''}`
  );
}

export async function getTicketDetail(id: string) {
  return request<{ ticket: Ticket; timeline: TimelineEvent[] }>(`/tickets/${id}`);
}

export async function createTicket(data: {
  assetId: string;
  location: string;
  description: string;
  priorityId: string;
}) {
  return request<{ ticket: Ticket }>('/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function assignTicket(id: string, assigneeId: string, note?: string) {
  return request<{ ticket: Ticket }>(`/tickets/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assigneeId, note }),
  });
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  note?: string,
  reopenReason?: string
) {
  return request<{ ticket: Ticket }>(`/tickets/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, note, reopenReason }),
  });
}

export async function addTicketNote(id: string, note: string) {
  return request<{ timeline: TimelineEvent[] }>(`/tickets/${id}/note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export async function deEscalateTicket(id: string, reason: string) {
  return request<{ ticket: Ticket; timeline: TimelineEvent[] }>(`/tickets/${id}/de-escalate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function createEscalationException(
  id: string,
  type: 'delay' | 'exempt',
  reason: string,
  deadline: string
) {
  return request<{ ticket: Ticket; timeline: TimelineEvent[]; escalationExceptions: EscalationException[] }>(`/tickets/${id}/escalation-exception`, {
    method: 'POST',
    body: JSON.stringify({ type, reason, deadline }),
  });
}

export async function revokeEscalationException(id: string, reason: string) {
  return request<{ ticket: Ticket; timeline: TimelineEvent[]; escalationExceptions: EscalationException[] }>(`/tickets/${id}/escalation-exception`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

export async function getAssets() {
  return request<{ assets: Asset[]; groups: AssetGroup[] }>('/assets');
}

export async function createAsset(data: Omit<Asset, 'id' | 'createdAt'>) {
  return request<{ asset: Asset }>('/assets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAsset(id: string, data: Partial<Asset>) {
  return request<{ asset: Asset }>(`/assets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAsset(id: string) {
  return request(`/assets/${id}`, { method: 'DELETE' });
}

export async function getPriorities() {
  return request<{ priorities: Priority[] }>('/priorities');
}

export async function updatePriorities(priorities: Priority[]) {
  return request<{ priorities: Priority[] }>('/priorities', {
    method: 'PUT',
    body: JSON.stringify({ priorities }),
  });
}

export async function getTechnicians() {
  return request<{ technicians: PublicUser[] }>('/technicians');
}

export function buildExportUrl(params: {
  startDate?: string;
  endDate?: string;
  status?: string;
  format?: 'csv' | 'json';
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const token = getAuthToken();
  const query = searchParams.toString();
  return `${API_BASE}/export/tickets${query ? `?${query}` : ''}${token ? (query ? '&' : '?') + `x-user-id=${token}` : ''}`;
}

export async function batchChangePriority(
  ticketIds: string[],
  priorityId: string,
  reason: string,
  expectedVersions: Record<string, number>,
  batchOperationId: string
) {
  return request<BatchOperationResult>('/tickets/batch/priority', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, priorityId, reason, expectedVersions, batchOperationId }),
  });
}

export async function batchChangeAssignee(
  ticketIds: string[],
  assigneeId: string,
  reason: string,
  expectedVersions: Record<string, number>,
  batchOperationId: string
) {
  return request<BatchOperationResult>('/tickets/batch/assign', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, assigneeId, reason, expectedVersions, batchOperationId }),
  });
}

export async function batchSetEscalationException(
  ticketIds: string[],
  type: EscalationExceptionType,
  reason: string,
  deadline: string,
  expectedVersions: Record<string, number>,
  batchOperationId: string
) {
  return request<BatchOperationResult>('/tickets/batch/exception', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, type, reason, deadline, expectedVersions, batchOperationId }),
  });
}

export async function batchRevokeEscalationException(
  ticketIds: string[],
  reason: string,
  expectedVersions: Record<string, number>,
  batchOperationId: string
) {
  return request<BatchOperationResult>('/tickets/batch/exception/revoke', {
    method: 'POST',
    body: JSON.stringify({ ticketIds, reason, expectedVersions, batchOperationId }),
  });
}
