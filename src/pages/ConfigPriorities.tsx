import { useState } from 'react';
import { Plus, Trash2, GripVertical, Save, Gauge } from 'lucide-react';
import { useConfigStore } from '../store';
import { showToastGlobal } from '../components/layout/MainLayout';
import type { Priority } from '../../shared/types';

export default function ConfigPriorities() {
  const { priorities, savePriorities, isLoading } = useConfigStore();
  const [localPriorities, setLocalPriorities] = useState<Priority[]>(priorities);
  const [hasChanges, setHasChanges] = useState(false);

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
    };
    updateLocal([...localPriorities, newPri]);
  };

  const handleChange = (id: string, field: keyof Priority, value: string | number) => {
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-blue-600" />
            优先级配置
          </h1>
          <p className="text-slate-500 text-sm">管理工单优先级的名称、颜色和排序</p>
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
        <div className="space-y-3">
          {localPriorities.sort((a, b) => a.sort - b.sort).map((priority, idx) => (
            <div key={priority.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg group">
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
              <div className="w-8 h-8 rounded-md" style={{ backgroundColor: priority.color }} />
              <input
                type="text"
                className="input flex-1 max-w-xs"
                value={priority.name}
                onChange={(e) => handleChange(priority.id, 'name', e.target.value)}
              />
              <input
                type="color"
                className="w-12 h-10 rounded-lg border border-slate-300 cursor-pointer p-1 bg-white"
                value={priority.color}
                onChange={(e) => handleChange(priority.id, 'color', e.target.value)}
              />
              <button
                onClick={() => handleDelete(priority.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
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
