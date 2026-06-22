import { useNavigate } from 'react-router-dom';
import { MapPin, User, Clock, AlertCircle, Megaphone, Shield } from 'lucide-react';
import type { Ticket } from '../../../shared/types';
import { getStatusBadgeClass, getStatusLabel, timeAgo, getEscalationBadgeClass, getExceptionBadgeClass, formatDateTime } from '../../utils/helpers';

interface TicketCardProps {
  ticket: Ticket;
}

export default function TicketCard({ ticket }: TicketCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className={`card p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200 group relative ${
        ticket.isEscalated ? 'ring-2 ring-rose-300 border-rose-300 bg-rose-50/20' : ''
      }`}
    >
      {ticket.isEscalated && (
        <div className="absolute -top-2 -right-2 z-10">
          <span className={`badge ${getEscalationBadgeClass()} shadow-sm flex items-center gap-1`} title={ticket.escalationReason}>
            <Megaphone className="w-3 h-3" />
            催办中
          </span>
        </div>
      )}
      {ticket.escalationException && !ticket.isEscalated && (
        <div className="absolute -top-2 -right-2 z-10">
          <span className={`badge ${getExceptionBadgeClass(ticket.escalationException.type)} shadow-sm flex items-center gap-1`} title={ticket.escalationException.reason}>
            <Shield className="w-3 h-3" />
            {ticket.escalationException.type === 'delay' ? '延后' : '免催'}
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`badge ${getStatusBadgeClass(ticket.status)}`}>
              {getStatusLabel(ticket.status)}
            </span>
            {ticket.priority && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: ticket.priority.color }}
              >
                <AlertCircle className="w-3 h-3" />
                {ticket.priority.name}
              </span>
            )}
            {ticket.isEscalated && ticket.escalatedAt && (
              <span className="text-[10px] text-rose-600 font-medium">
                催办时间：{formatDateTime(ticket.escalatedAt)}
              </span>
            )}
          </div>
          <h4 className="font-medium text-slate-900 text-sm truncate group-hover:text-blue-700">
            {ticket.asset?.name || '未知设备'}
          </h4>
          <p className="text-xs text-slate-500 font-mono">{ticket.asset?.code}</p>
        </div>
      </div>

      <p className="text-sm text-slate-600 line-clamp-2 mb-3">{ticket.description}</p>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          <span className="truncate max-w-[120px]">{ticket.location}</span>
        </div>
        {ticket.isEscalated && ticket.escalationOwner ? (
          <div className="flex items-center gap-1 text-rose-600 font-medium">
            <User className="w-3.5 h-3.5" />
            <span>督办：{ticket.escalationOwner.name}</span>
          </div>
        ) : ticket.assignee ? (
          <div className="flex items-center gap-1">
            <User className="w-3.5 h-3.5" />
            <span>{ticket.assignee.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-600">
            <User className="w-3.5 h-3.5" />
            <span>待派工</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Clock className="w-3.5 h-3.5" />
          <span>{timeAgo(ticket.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
