import { Search, X, Filter } from 'lucide-react';
import { useTicketStore, useConfigStore } from '../../store';
import type { TicketFilters as TF, TicketStatus } from '../../../shared/types';
import { STATUS_LABELS } from '../../../shared/types';

interface TicketFiltersProps {
  showSearch?: boolean;
  showStatus?: boolean;
}

export default function TicketFilters({ showSearch = true, showStatus = true }: TicketFiltersProps) {
  const filters = useTicketStore((s) => s.filters);
  const setFilters = useTicketStore((s) => s.setFilters);
  const fetchTickets = useTicketStore((s) => s.fetchTickets);
  const { assets, assetGroups, priorities, technicians } = useConfigStore();

  const updateFilter = (key: keyof TF, value: string | undefined) => {
    const newFilters = { ...filters };
    if (value === undefined || value === '') {
      delete newFilters[key];
    } else {
      (newFilters as Record<string, string>)[key] = value;
    }
    setFilters(newFilters);
    fetchTickets(newFilters);
  };

  const clearAll = () => {
    setFilters({});
    fetchTickets({});
  };

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-slate-500" />
        <h3 className="font-medium text-slate-700">筛选条件</h3>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 text-sm text-slate-500 hover:text-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
            清空
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {showSearch && (
          <div className="lg:col-span-2">
            <label className="label">搜索</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder="搜索设备、描述..."
                value={filters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label className="label">资产分组</label>
          <select
            className="select"
            value={filters.groupId || ''}
            onChange={(e) => updateFilter('groupId', e.target.value || undefined)}
          >
            <option value="">全部分组</option>
            {assetGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">设备</label>
          <select
            className="select"
            value={filters.assetId || ''}
            onChange={(e) => updateFilter('assetId', e.target.value || undefined)}
          >
            <option value="">全部设备</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">优先级</label>
          <select
            className="select"
            value={filters.priorityId || ''}
            onChange={(e) => updateFilter('priorityId', e.target.value || undefined)}
          >
            <option value="">全部优先级</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">处理人</label>
          <select
            className="select"
            value={filters.assigneeId || ''}
            onChange={(e) => updateFilter('assigneeId', e.target.value || undefined)}
          >
            <option value="">全部处理人</option>
            <option value="unassigned">未分配</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {showStatus && (
          <div>
            <label className="label">状态</label>
            <select
              className="select"
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', (e.target.value || undefined) as TicketStatus)}
            >
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
