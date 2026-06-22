import { create } from 'zustand';
import type { Ticket, TicketFilters, TimelineEvent, TicketStatus } from '../../shared/types';
import {
  getTickets as apiGetTickets,
  getTicketDetail as apiGetTicketDetail,
  createTicket as apiCreateTicket,
  assignTicket as apiAssignTicket,
  updateTicketStatus as apiUpdateTicketStatus,
  addTicketNote as apiAddTicketNote,
} from '../utils/api';

interface TicketState {
  tickets: Ticket[];
  total: number;
  currentTicket: Ticket | null;
  timeline: TimelineEvent[];
  filters: TicketFilters;
  isLoading: boolean;
  error: string | null;
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
  setFilters: (filters: TicketFilters) => void;
  clearError: () => void;
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
  filters: loadSavedFilters(),
  isLoading: false,
  error: null,

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

  setFilters: (filters) => {
    set({ filters });
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  },

  clearError: () => set({ error: null }),
}));
