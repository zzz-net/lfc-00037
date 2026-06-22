import { useState } from 'react';
import { Download, FileText, Filter, Calendar, CheckCircle2 } from 'lucide-react';
import { buildExportUrl } from '../utils/api';
import { STATUS_LABELS, type TicketStatus } from '../../shared/types';

export default function ExportCenter() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  const handleExport = () => {
    const params: Record<string, string> = { format };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (status) params.status = status;
    const url = buildExportUrl(params);
    window.location.href = url;
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Download className="w-6 h-6 text-blue-600" />
          导出中心
        </h1>
        <p className="text-slate-500 text-sm">按条件筛选并导出维修记录历史数据</p>
      </div>

      <div className="card p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-400" />
          筛选条件
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              开始日期
            </label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              结束日期
            </label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">工单状态</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key as TicketStatus}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className="label">导出格式</label>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`relative flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                format === 'csv' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="format"
                className="sr-only"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              <FileText className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-slate-900">CSV 格式</p>
                <p className="text-xs text-slate-500">Excel 兼容，推荐使用</p>
              </div>
              {format === 'csv' && <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />}
            </label>
            <label
              className={`relative flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                format === 'json' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="format"
                className="sr-only"
                checked={format === 'json'}
                onChange={() => setFormat('json')}
              />
              <FileText className="w-8 h-8 text-amber-600" />
              <div>
                <p className="font-medium text-slate-900">JSON 格式</p>
                <p className="text-xs text-slate-500">结构化数据，便于程序处理</p>
              </div>
              {format === 'json' && <CheckCircle2 className="w-5 h-5 text-blue-600 ml-auto" />}
            </label>
          </div>
        </div>

        <button onClick={handleExport} className="w-full btn-primary py-3 text-base">
          <Download className="w-5 h-5" />
          导出维修记录
        </button>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-3">导出说明</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            导出内容包含：工单ID、设备信息、位置、问题描述、优先级、状态、报修人、处理人、各时间节点等完整数据
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            CSV 格式包含 UTF-8 BOM 头，可直接用 Excel 打开显示中文
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            不设置日期范围将导出全部历史数据
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            仅管理员角色可访问导出功能
          </li>
        </ul>
      </div>
    </div>
  );
}
