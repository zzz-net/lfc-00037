import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Send, ArrowLeft, AlertCircle } from 'lucide-react';
import { useTicketStore, useConfigStore } from '../store';
import { showToastGlobal } from '../components/layout/MainLayout';

export default function SubmitTicket() {
  const navigate = useNavigate();
  const { createTicket, isLoading } = useTicketStore();
  const { assets, assetGroups, priorities } = useConfigStore();

  const [groupId, setGroupId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredAssets = groupId ? assets.filter((a) => a.groupId === groupId) : assets;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!assetId) newErrors.assetId = '请选择报修设备';
    if (!location.trim()) newErrors.location = '请填写位置信息';
    if (!description.trim()) newErrors.description = '请填写问题描述';
    else if (description.trim().length < 10) newErrors.description = '问题描述至少需要10个字符';
    if (!priorityId) newErrors.priorityId = '请选择优先级';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      const ticket = await createTicket({ assetId, location: location.trim(), description: description.trim(), priorityId });
      showToastGlobal('报修工单提交成功', 'success');
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '提交失败', 'error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      <div className="card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">提交设备报修</h1>
            <p className="text-slate-500 text-sm">请填写以下信息提交设备故障报修</p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">提交须知</p>
              <ul className="space-y-0.5 text-blue-600">
                <li>• 请准确选择故障设备和填写具体位置</li>
                <li>• 问题描述请尽量详细，不少于10个字符</li>
                <li>• 根据故障影响范围选择合适的优先级</li>
              </ul>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label">资产分组 <span className="text-red-500">*</span></label>
              <select
                className={`select ${errors.assetId ? 'border-red-400' : ''}`}
                value={groupId}
                onChange={(e) => { setGroupId(e.target.value); setAssetId(''); }}
              >
                <option value="">全部分组</option>
                {assetGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">报修设备 <span className="text-red-500">*</span></label>
              <select
                className={`select ${errors.assetId ? 'border-red-400' : ''}`}
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  const selected = assets.find((a) => a.id === e.target.value);
                  if (selected && !location) setLocation(selected.location);
                }}
              >
                <option value="">请选择设备</option>
                {filteredAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
              {errors.assetId && <p className="text-xs text-red-500 mt-1">{errors.assetId}</p>}
            </div>
          </div>

          <div>
            <label className="label">位置信息 <span className="text-red-500">*</span></label>
            <input
              type="text"
              className={`input ${errors.location ? 'border-red-400' : ''}`}
              placeholder="例如：图书馆一楼大厅东侧"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
          </div>

          <div>
            <label className="label">问题描述 <span className="text-red-500">*</span></label>
            <textarea
              className={`input resize-none h-32 ${errors.description ? 'border-red-400' : ''}`}
              placeholder="请详细描述故障现象，例如：屏幕显示异常、无法识别读者卡、打印卡纸等..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex justify-between items-center mt-1">
              {errors.description ? (
                <p className="text-xs text-red-500">{errors.description}</p>
              ) : (
                <span />
              )}
              <span className={`text-xs ${description.length < 10 ? 'text-slate-400' : 'text-emerald-600'}`}>
                {description.length} / 至少10字符
              </span>
            </div>
          </div>

          <div>
            <label className="label">优先级 <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {priorities.map((p) => (
                <label
                  key={p.id}
                  className={`relative flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    priorityId === p.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    className="sr-only"
                    checked={priorityId === p.id}
                    onChange={() => setPriorityId(p.id)}
                  />
                  <span className="w-4 h-4 rounded-full border-2" style={{ borderColor: p.color }}>
                    {priorityId === p.id && (
                      <span className="block w-full h-full rounded-full" style={{ backgroundColor: p.color }} />
                    )}
                  </span>
                  <span className="text-sm font-medium" style={{ color: p.color }}>{p.name}</span>
                </label>
              ))}
            </div>
            {errors.priorityId && <p className="text-xs text-red-500 mt-1">{errors.priorityId}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">取消</button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              <Send className="w-4 h-4" />
              {isLoading ? '提交中...' : '提交报修'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
