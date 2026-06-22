import { useState } from 'react';
import { Plus, Pencil, Trash2, Library, Save, X } from 'lucide-react';
import { useConfigStore } from '../store';
import { showToastGlobal } from '../components/layout/MainLayout';
import Modal from '../components/common/Modal';
import type { Asset } from '../../shared/types';

export default function ConfigAssets() {
  const { assets, assetGroups, createAsset, updateAsset, removeAsset, isLoading } = useConfigStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: '', location: '', groupId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', type: '', location: '', groupId: '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({ code: asset.code, name: asset.name, type: asset.type, location: asset.location, groupId: asset.groupId });
    setErrors({});
    setModalOpen(true);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = '资产编号不能为空';
    if (!form.name.trim()) e.name = '资产名称不能为空';
    if (!form.type.trim()) e.type = '资产类型不能为空';
    if (!form.location.trim()) e.location = '位置信息不能为空';
    if (!form.groupId) e.groupId = '请选择资产分组';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      if (editing) {
        await updateAsset(editing.id, form);
        showToastGlobal('资产已更新', 'success');
      } else {
        await createAsset(form);
        showToastGlobal('资产已创建', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`确定要删除资产「${asset.name}」吗？`)) return;
    try {
      await removeAsset(asset.id);
      showToastGlobal('资产已删除', 'success');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  const groupedAssets = assetGroups.map((g) => ({
    group: g,
    items: assets.filter((a) => a.groupId === g.id),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Library className="w-6 h-6 text-blue-600" />
            资产分组管理
          </h1>
          <p className="text-slate-500 text-sm">管理图书馆的设备资产，按分组进行归类</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          添加资产
        </button>
      </div>

      <div className="space-y-6">
        {groupedAssets.map(({ group, items }) => (
          <div key={group.id} className="card overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{group.name}</h3>
              <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                {items.length} 台设备
              </span>
            </div>
            {items.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">暂无设备</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white">
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">资产编号</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">名称</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">类型</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">位置</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((asset) => (
                      <tr key={asset.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3 text-sm font-mono text-slate-700">{asset.code}</td>
                        <td className="px-6 py-3 text-sm font-medium text-slate-900">{asset.name}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{asset.type}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{asset.location}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openEdit(asset)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(asset)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '编辑资产' : '添加资产'}>
        <div className="space-y-4">
          <div>
            <label className="label">资产编号 <span className="text-red-500">*</span></label>
            <input
              type="text"
              className={`input ${errors.code ? 'border-red-400' : ''}`}
              placeholder="如：LIB-SS-001"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
          </div>
          <div>
            <label className="label">资产名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              className={`input ${errors.name ? 'border-red-400' : ''}`}
              placeholder="如：一楼自助借还机A"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">资产类型 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={`input ${errors.type ? 'border-red-400' : ''}`}
                placeholder="如：自助借还机"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />
              {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
            </div>
            <div>
              <label className="label">资产分组 <span className="text-red-500">*</span></label>
              <select
                className={`select ${errors.groupId ? 'border-red-400' : ''}`}
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              >
                <option value="">请选择分组</option>
                {assetGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {errors.groupId && <p className="text-xs text-red-500 mt-1">{errors.groupId}</p>}
            </div>
          </div>
          <div>
            <label className="label">位置信息 <span className="text-red-500">*</span></label>
            <input
              type="text"
              className={`input ${errors.location ? 'border-red-400' : ''}`}
              placeholder="如：图书馆一楼大厅"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">
              <X className="w-4 h-4" />
              取消
            </button>
            <button onClick={handleSave} disabled={isLoading} className="btn-primary">
              <Save className="w-4 h-4" />
              {editing ? '保存修改' : '添加'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
