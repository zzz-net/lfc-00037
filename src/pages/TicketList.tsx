import { useNavigate } from 'react-router-dom';
import { Plus, Eye, MapPin, User, AlertCircle } from 'lucide-react';
import { useTicketStore } from '../store';
import TicketFilters from '../components/ticket/TicketFilters';
import { getStatusBadgeClass, getStatusLabel, formatDateTime } from '../utils/helpers';

export default function TicketList() {
  const { tickets, isLoading, total } = useTicketStore();
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">工单列表</h1>
          <p className="text-slate-500 text-sm">共 {total} 条工单记录</p>
        </div>
        <button onClick={() => navigate('/submit')} className="btn-primary">
          <Plus className="w-4 h-4" />
          提交报修
        </button>
      </div>

      <TicketFilters />

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16 text-slate-500">加载中...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-slate-500">暂无工单数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">工单信息</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">位置</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">优先级</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">处理人</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">提交时间</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{ticket.asset?.name || '未知设备'}</p>
                        <p className="text-xs text-slate-500 font-mono">{ticket.asset?.code}</p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{ticket.description}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {ticket.location}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.priority && (
                        <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: ticket.priority.color }}>
                          <AlertCircle className="w-3.5 h-3.5" />
                          {ticket.priority.name}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
                        {getStatusLabel(ticket.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.assignee ? (
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {ticket.assignee.name}
                        </div>
                      ) : (
                        <span className="text-sm text-amber-600">待派工</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDateTime(ticket.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
