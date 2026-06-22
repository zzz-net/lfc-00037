import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Save, Gauge, Clock, UserCheck, Shield } from 'lucide-react';
import { useConfigStore } from '../store';
import { showToastGlobal } from '../components/layout/MainLayout';
import type { Priority } from '../../shared/types';
import { ROLE_LABELS } from '../../shared/types';

export default function ConfigPriorities() {
  const { priorities, savePriorities, isLoading, escalationCandidates } = useConfigStore();
  const [localPriorities, setLocalPriorities] = useState<Priority[]>(priorities);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalPriorities(priorities);
  }, [priorities]);

  const updateLocal = (updated: Priority[]) => {
    setLocalPriorities(updated);
    setHasChanges(true);
  };

  const handleAdd = () => {
    const newPri: Priority = {
      id: `pri_${Date.now()}`,
      name: '新优先级',
      color: '#6b7280',
      sort: localPriorities.length + 1,
      responseTimeMinutes: 0,
      escalationOwnerId: escalationCandidates[0]?.id || undefined,
    };
    updateLocal([...localPriorities, newPri]);
  };

  const handleChange = (id: string, field: keyof Priority, value: string | number | undefined) => {
    updateLocal(
      localPriorities.map((p) => (p.id === id ? { ...p, [field]: value } : p)).sort((a, b) => a.sort - b.sort)
    );
  };

  const handleDelete = (id: string) => {
    if (localPriorities.length <= 1) {
      showToastGlobal('至少保留一个优先级', 'error');
      return;
    }
    updateLocal(localPriorities.filter((p) => p.id !== id).map((p, i) => ({ ...p, sort: i + 1 })));
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const sorted = [...localPriorities].sort((a, b) => a.sort - b.sort);
    const idx = sorted.findIndex((p) => p.id === id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === sorted.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    const reindexed = sorted.map((p, i) => ({ ...p, sort: i + 1 }));
    updateLocal(reindexed);
  };

  const handleSave = async () => {
    try {
      await savePriorities(localPriorities);
      showToastGlobal('优先级配置已保存', 'success');
      setHasChanges(false);
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-600" />
            优先级配置
          </h1>
          <p className="text-slate-500 text-sm">管理工单优先级的名称、颜色、排序、响应时限和升级负责人</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAdd} className="btn-secondary">
            <Plus className="w-4 h-4" />
            添加
          </button>
          <button onClick={handleSave} disabled={!hasChanges || isLoading} className="btn-primary">
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>• <strong>响应时限</strong>：工单从创建到进入处理的最长允许时间（分钟）。填 0 表示不限时。</p>
            <p>• <strong>升级负责人</strong>：超时未处理时，工单自动进入「催办中」，由该负责人督办，并写入时间线和催办记录表。</p>
            <p>• 已完成工单自动清除催办标记；重新打开后若仍超时将按新时限重新计算。</p>
          </div>
        </div>

        <div className="hidden lg:grid grid-cols-12 gap-3 px-3 pb-2 text-xs font-medium text-slate-500 border-b border-slate-200 mb-3">
          <div className="col-span-1">排序</div>
          <div className="col-span-1">颜色</div>
          <div className="col-span-2">优先级名称</div>
          <div className="col-span-2">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />响应时限(分钟)</span>
          </div>
          <div className="col-span-4">
            <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" />升级负责人</span>
          </div>
          <div className="col-span-2 text-right">操作</div>
        </div>

        <div className="space-y-3">
          {localPriorities.sort((a, b) => a.sort - b.sort).map((priority, idx) => (
            <div key={priority.id} className="lg:grid lg:grid-cols-12 lg:items-center gap-3 p-3 bg-slate-50 rounded-lg group">
              <div className="col-span-1 flex items-center gap-2 mb-2 lg:mb-0">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMove(priority.id, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <GripVertical className="w-3 h-3 rotate-90" />
                  </button>
                  <button
                    onClick={() => handleMove(priority.id, 'down')}
                    disabled={idx === localPriorities.length - 1}
                    className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <GripVertical className="w-3 h-3 -rotate-90" />
                  </button>
                </div>
                <span className="text-xs font-medium text-slate-500">#{priority.sort}</span>
              </div>
              <div className="col-span-1 flex items-center mb-2 lg:mb-0">
                <div className="w-10 h-10 rounded-md" style={{ backgroundColor: priority.color }} />
              </div>
              <div className="col-span-2 mb-2 lg:mb-0">
                <label className="lg:hidden label text-xs">优先级名称</label>
                <input
                  type="text"
                  className="input w-full"
                  value={priority.name}
                  onChange={(e) => handleChange(priority.id, 'name', e.target.value)}
                />
              </div>
              <div className="col-span-2 mb-2 lg:mb-0 flex items-center gap-2">
                <label className="lg:hidden label text-xs">颜色</label>
                <input
                  type="color"
                  className="w-12 h-10 rounded-lg border border-slate-300 cursor-pointer p-1 bg-white lg:hidden"
                  value={priority.color}
                  onChange={(e) => handleChange(priority.id, 'color', e.target.value)}
                />
                <label className="lg:hidden label text-xs flex-1">响应时限(分钟)</label>
                <input
                  type="number"
                  min="0"
                  className="input w-full"
                  placeholder="0=不限时"
                  value={priority.responseTimeMinutes ?? 0}
                  onChange={(e) =>
                    handleChange(
                      priority.id,
                      'responseTimeMinutes',
                      e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                />
              </div>
              <div className="col-span-4 mb-2 lg:mb-0">
                <label className="lg:hidden label text-xs">升级负责人</label>
                <select
                  className="select w-full"
                  value={priority.escalationOwnerId || ''}
                  onChange={(e) =>
                    handleChange(priority.id, 'escalationOwnerId', e.target.value || undefined)
                  }
                >
                  <option value="">-- 未指定（默认管理员）--</option>
                  {escalationCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{ROLE_LABELS[c.role as keyof typeof ROLE_LABELS] || c.role}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                <input
                  type="color"
                  className="hidden lg:block w-12 h-10 rounded-lg border border-slate-300 cursor-pointer p-1 bg-white"
                  value={priority.color}
                  onChange={(e) => handleChange(priority.id, 'color', e.target.value)}
                />
                <button
                  onClick={() => handleDelete(priority.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="删除优先级"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {hasChanges && (
          <p className="mt-4 text-sm text-amber-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            有未保存的更改，请点击「保存」按钮
          </p>
        )}
      </div>
    </div>
  );
}
