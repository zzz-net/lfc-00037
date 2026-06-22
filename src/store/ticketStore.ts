import { create } from 'zustand';
import type { Ticket, TicketFilters, TimelineEvent, TicketStatus, EscalationRecord, EscalationException, BatchOperationResult, EscalationExceptionType, PersistedBatchOperation } from '../../shared/types';
import {
  getTickets as apiGetTickets,
  getTicketDetail as apiGetTicketDetail,
  createTicket as apiCreateTicket,
  assignTicket as apiAssignTicket,
  updateTicketStatus as apiUpdateTicketStatus,
  addTicketNote as apiAddTicketNote,
  deEscalateTicket as apiDeEscalateTicket,
  createEscalationException as apiCreateEscalationException,
  revokeEscalationException as apiRevokeEscalationException,
  batchChangePriority as apiBatchChangePriority,
  batchChangeAssignee as apiBatchChangeAssignee,
  batchSetEscalationException as apiBatchSetException,
  batchRevokeEscalationException as apiBatchRevokeException,
  getBatchOperations as apiGetBatchOperations,
  getBatchOperationDetail as apiGetBatchOperationDetail,
} from '../utils/api';

interface TicketState {
  tickets: Ticket[];
  total: number;
  currentTicket: Ticket | null;
  timeline: TimelineEvent[];
  escalationRecords: EscalationRecord[];
  escalationExceptions: EscalationException[];
  filters: TicketFilters;
  selectedTicketIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  lastBatchResult: BatchOperationResult | null;
  batchOperations: PersistedBatchOperation[];
  batchOperationsTotal: number;
  currentBatchOperation: PersistedBatchOperation | null;
  fetchTickets: (filters?: TicketFilters) => Promise<void>;
  fetchTicketDetail: (id: string) => Promise<void>;
  createTicket: (data: {
    assetId: string;
    location: string;
    description: string;
    priorityId: string;
  }) => Promise<Ticket>;
  assignTicket: (id: string, assigneeId: string, note?: string) => Promise<void>;
  updateTicketStatus: (
    id: string,
    status: TicketStatus,
    note?: string,
    reopenReason?: string
  ) => Promise<void>;
  addNote: (id: string, note: string) => Promise<void>;
  revokeEscalation: (id: string, reason: string) => Promise<void>;
  createEscalationException: (id: string, type: 'delay' | 'exempt', reason: string, deadline: string) => Promise<void>;
  revokeEscalationException: (id: string, reason: string) => Promise<void>;
  batchChangePriority: (ticketIds: string[], priorityId: string, reason: string) => Promise<BatchOperationResult>;
  batchChangeAssignee: (ticketIds: string[], assigneeId: string, reason: string) => Promise<BatchOperationResult>;
  batchSetException: (ticketIds: string[], type: EscalationExceptionType, reason: string, deadline: string) => Promise<BatchOperationResult>;
  batchRevokeException: (ticketIds: string[], reason: string) => Promise<BatchOperationResult>;
  fetchBatchOperations: () => Promise<void>;
  fetchBatchOperationDetail: (batchOperationId: string) => Promise<void>;
  clearCurrentBatchOperation: () => void;
  setFilters: (filters: TicketFilters) => void;
  toggleSelectTicket: (ticketId: string) => void;
  selectAllTickets: (ticketIds: string[]) => void;
  clearSelection: () => void;
  clearError: () => void;
  clearLastBatchResult: () => void;
}

const FILTERS_KEY = 'ticket_filters';

function loadSavedFilters(): TicketFilters {
  try {
    const saved = localStorage.getItem(FILTERS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  total: 0,
  currentTicket: null,
  timeline: [],
  escalationRecords: [],
  escalationExceptions: [],
  filters: loadSavedFilters(),
  selectedTicketIds: new Set(),
  isLoading: false,
  error: null,
  lastBatchResult: null,
  batchOperations: [],
  batchOperationsTotal: 0,
  currentBatchOperation: null,

  fetchTickets: async (filters) => {
    const mergedFilters = { ...get().filters, ...filters };
    set({ isLoading: true, error: null, filters: mergedFilters });
    localStorage.setItem(FILTERS_KEY, JSON.stringify(mergedFilters));
    try {
      const result = await apiGetTickets(mergedFilters);
      set({ tickets: result.tickets, total: result.total, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取工单列表失败',
        isLoading: false,
      });
    }
  },

  fetchTicketDetail: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetTicketDetail(id);
      set({
        currentTicket: result.ticket,
        timeline: result.timeline,
        escalationRecords: (result as any).escalationRecords || [],
        escalationExceptions: (result as any).escalationExceptions || [],
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取工单详情失败',
        isLoading: false,
      });
      throw err;
    }
  },

  createTicket: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiCreateTicket(data);
      set({ isLoading: false });
      await get().fetchTickets();
      return result.ticket;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '创建工单失败',
        isLoading: false,
      });
      throw err;
    }
  },

  assignTicket: async (id, assigneeId, note) => {
    set({ isLoading: true, error: null });
    try {
      await apiAssignTicket(id, assigneeId, note);
      set({ isLoading: false });
      await get().fetchTicketDetail(id);
      await get().fetchTickets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '派工失败',
        isLoading: false,
      });
      throw err;
    }
  },

  updateTicketStatus: async (id, status, note, reopenReason) => {
    set({ isLoading: true, error: null });
    try {
      await apiUpdateTicketStatus(id, status, note, reopenReason);
      set({ isLoading: false });
      await get().fetchTicketDetail(id);
      await get().fetchTickets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '更新状态失败',
        isLoading: false,
      });
      throw err;
    }
  },

  addNote: async (id, note) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiAddTicketNote(id, note);
      set({ timeline: result.timeline, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '添加备注失败',
        isLoading: false,
      });
      throw err;
    }
  },

  revokeEscalation: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiDeEscalateTicket(id, reason);
      set({
        currentTicket: result.ticket,
        timeline: result.timeline,
        escalationRecords: (result as any).escalationRecords || get().escalationRecords,
        isLoading: false,
      });
      await get().fetchTickets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '撤销催办失败',
        isLoading: false,
      });
      throw err;
    }
  },

  createEscalationException: async (id, type, reason, deadline) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiCreateEscalationException(id, type, reason, deadline);
      set({
        currentTicket: result.ticket,
        timeline: result.timeline,
        escalationExceptions: (result as any).escalationExceptions || get().escalationExceptions,
        isLoading: false,
      });
      await get().fetchTickets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '设置催办例外失败',
        isLoading: false,
      });
      throw err;
    }
  },

  revokeEscalationException: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiRevokeEscalationException(id, reason);
      set({
        currentTicket: result.ticket,
        timeline: result.timeline,
        escalationExceptions: (result as any).escalationExceptions || get().escalationExceptions,
        isLoading: false,
      });
      await get().fetchTickets();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '撤销催办例外失败',
        isLoading: false,
      });
      throw err;
    }
  },

  setFilters: (filters) => {
    set({ filters, selectedTicketIds: new Set() });
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  },

  clearError: () => set({ error: null }),

  toggleSelectTicket: (ticketId) => {
    set((state) => {
      const newSelected = new Set(state.selectedTicketIds);
      if (newSelected.has(ticketId)) {
        newSelected.delete(ticketId);
      } else {
        newSelected.add(ticketId);
      }
      return { selectedTicketIds: newSelected };
    });
  },

  selectAllTickets: (ticketIds) => {
    set({ selectedTicketIds: new Set(ticketIds) });
  },

  clearSelection: () => {
    set({ selectedTicketIds: new Set() });
  },

  clearLastBatchResult: () => {
    set({ lastBatchResult: null });
  },

  batchChangePriority: async (ticketIds, priorityId, reason) => {
    set({ isLoading: true, error: null });
    try {
      const selectedTickets = get().tickets.filter((t) => ticketIds.includes(t.id));
      const expectedVersions: Record<string, number> = {};
      selectedTickets.forEach((t) => {
        expectedVersions[t.id] = t.version || 1;
      });
      const batchOperationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
      const result = await apiBatchChangePriority(ticketIds, priorityId, reason, expectedVersions, batchOperationId);
      set({ lastBatchResult: result, isLoading: false, selectedTicketIds: new Set() });
      await get().fetchTickets();
      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '批量修改优先级失败',
        isLoading: false,
      });
      throw err;
    }
  },

  batchChangeAssignee: async (ticketIds, assigneeId, reason) => {
    set({ isLoading: true, error: null });
    try {
      const selectedTickets = get().tickets.filter((t) => ticketIds.includes(t.id));
      const expectedVersions: Record<string, number> = {};
      selectedTickets.forEach((t) => {
        expectedVersions[t.id] = t.version || 1;
      });
      const batchOperationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
      const result = await apiBatchChangeAssignee(ticketIds, assigneeId, reason, expectedVersions, batchOperationId);
      set({ lastBatchResult: result, isLoading: false, selectedTicketIds: new Set() });
      await get().fetchTickets();
      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '批量派工失败',
        isLoading: false,
      });
      throw err;
    }
  },

  batchSetException: async (ticketIds, type, reason, deadline) => {
    set({ isLoading: true, error: null });
    try {
      const selectedTickets = get().tickets.filter((t) => ticketIds.includes(t.id));
      const expectedVersions: Record<string, number> = {};
      selectedTickets.forEach((t) => {
        expectedVersions[t.id] = t.version || 1;
      });
      const batchOperationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
      const result = await apiBatchSetException(ticketIds, type, reason, deadline, expectedVersions, batchOperationId);
      set({ lastBatchResult: result, isLoading: false, selectedTicketIds: new Set() });
      await get().fetchTickets();
      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '批量设置催办例外失败',
        isLoading: false,
      });
      throw err;
    }
  },

  batchRevokeException: async (ticketIds, reason) => {
    set({ isLoading: true, error: null });
    try {
      const selectedTickets = get().tickets.filter((t) => ticketIds.includes(t.id));
      const expectedVersions: Record<string, number> = {};
      selectedTickets.forEach((t) => {
        expectedVersions[t.id] = t.version || 1;
      });
      const batchOperationId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
      const result = await apiBatchRevokeException(ticketIds, reason, expectedVersions, batchOperationId);
      set({ lastBatchResult: result, isLoading: false, selectedTicketIds: new Set() });
      await get().fetchTickets();
      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '批量撤销催办例外失败',
        isLoading: false,
      });
      throw err;
    }
  },

  fetchBatchOperations: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetBatchOperations();
      set({
        batchOperations: result.operations,
        batchOperationsTotal: result.total,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取批量操作记录失败',
        isLoading: false,
      });
      throw err;
    }
  },

  fetchBatchOperationDetail: async (batchOperationId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiGetBatchOperationDetail(batchOperationId);
      set({
        currentBatchOperation: result.operation,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取批量操作详情失败',
        isLoading: false,
      });
      throw err;
    }
  },

  clearCurrentBatchOperation: () => {
    set({ currentBatchOperation: null });
  },
}));
