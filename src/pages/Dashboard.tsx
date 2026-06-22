import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Clock,
  Wrench,
  Package,
  PauseCircle,
  CheckCircle2,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { useTicketStore } from '../store';
import TicketCard from '../components/ticket/TicketCard';
import TicketFilters from '../components/ticket/TicketFilters';
import { KANBAN_COLUMNS, STATUS_LABELS, type TicketStatus } from '../../shared/types';

const STATUS_ICONS: Record<TicketStatus, typeof ClipboardList> = {
  pending: Clock,
  processing: Wrench,
  waiting_parts: Package,
  paused: PauseCircle,
  completed: CheckCircle2,
  reopened: Wrench,
};

const STATUS_ACCENTS: Record<TicketStatus, string> = {
  pending: 'from-amber-500 to-orange-500',
  processing: 'from-blue-500 to-cyan-500',
  waiting_parts: 'from-purple-500 to-pink-500',
  paused: 'from-slate-500 to-slate-600',
  completed: 'from-emerald-500 to-green-500',
  reopened: 'from-orange-500 to-red-500',
};

export default function Dashboard() {
  const { tickets, isLoading, total } = useTicketStore();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const result = { total, pending: 0, processing: 0, waiting_parts: 0, paused: 0, completed: 0 };
    tickets.forEach((t) => {
      if (t.status === 'reopened') {
        result.processing++;
      } else if (t.status in result) {
        (result as Record<string, number>)[t.status]++;
      }
    });
    return result;
  }, [tickets, total]);

  const columns = useMemo(() => {
    const map: Record<string, typeof tickets> = {};
    KANBAN_COLUMNS.forEach((status) => {
      map[status] = tickets.filter((t) => t.status === status || (status === 'processing' && t.status === 'reopened'));
    });
    return map;
  }, [tickets]);

  const statCards = [
    { label: '全部工单', value: stats.total, icon: ClipboardList, gradient: 'from-slate-600 to-slate-800' },
    { label: '待派工', value: stats.pending, icon: Clock, gradient: 'from-amber-500 to-orange-600' },
    { label: '处理中', value: stats.processing, icon: Wrench, gradient: 'from-blue-500 to-indigo-600' },
    { label: '等待配件', value: stats.waiting_parts, icon: Package, gradient: 'from-purple-500 to-fuchsia-600' },
    { label: '已完成', value: stats.completed, icon: CheckCircle2, gradient: 'from-emerald-500 to-green-600' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">维修看板</h1>
          <p className="text-slate-500 text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            实时监控所有设备报修工单的处理进度
          </p>
        </div>
        <button onClick={() => navigate('/submit')} className="btn-primary">
          <Plus className="w-4 h-4" />
          提交报修
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-5 overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-full -translate-y-8 translate-x-8`} />
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
            <p className="text-sm text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <TicketFilters showStatus={false} />

      {isLoading ? (
        <div className="text-center py-16 text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {KANBAN_COLUMNS.map((status) => {
            const Icon = STATUS_ICONS[status];
            const columnTickets = columns[status] || [];
            return (
              <div key={status} className="bg-slate-100/50 rounded-xl p-3">
                <div className="flex items-center gap-2 px-2 py-2 mb-3">
                  <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${STATUS_ACCENTS[status]} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-semibold text-slate-700 text-sm">{STATUS_LABELS[status]}</span>
                  <span className="ml-auto text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full">
                    {columnTickets.length}
                  </span>
                </div>
                <div className="space-y-3 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                  {columnTickets.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">暂无工单</div>
                  ) : (
                    columnTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
