import { useNavigate } from 'react-router-dom';
import { MapPin, User, Clock, AlertCircle } from 'lucide-react';
import type { Ticket } from '../../../shared/types';
import { getStatusBadgeClass, getStatusLabel, timeAgo } from '../../utils/helpers';

interface TicketCardProps {
  ticket: Ticket;
}

export default function TicketCard({ ticket }: TicketCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/tickets/${ticket.id}`)}
      className="card p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
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
        {ticket.assignee ? (
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
