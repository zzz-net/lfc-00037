import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, MapPin, User, AlertCircle, Megaphone, Shield, CheckSquare, Square, GripVertical, XCircle, CheckCircle2 } from 'lucide-react';
import { useTicketStore, useConfigStore, useAuthStore } from '../store';
import TicketFilters from '../components/ticket/TicketFilters';
import { getStatusBadgeClass, getStatusLabel, formatDateTime, getEscalationBadgeClass, getExceptionBadgeClass } from '../utils/helpers';
import Modal from '../components/common/Modal';
import { showToastGlobal } from '../components/layout/MainLayout';
import type { BatchOperationResult, EscalationExceptionType } from '../../shared/types';

type BatchAction = 'priority' | 'assignee' | 'exception_set' | 'exception_revoke' | null;

export default function TicketList() {
  const { tickets, isLoading, total, selectedTicketIds, lastBatchResult, toggleSelectTicket, selectAllTickets, clearSelection, batchChangePriority, batchChangeAssignee, batchSetException, batchRevokeException, clearLastBatchResult } = useTicketStore();
  const { priorities, technicians } = useConfigStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const [batchPriorityId, setBatchPriorityId] = useState('');
  const [batchAssigneeId, setBatchAssigneeId] = useState('');
  const [batchExceptionType, setBatchExceptionType] = useState<EscalationExceptionType>('delay');
  const [batchDeadline, setBatchDeadline] = useState('');
  const [batchReason, setBatchReason] = useState('');
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const allSelected = useMemo(() => {
    if (tickets.length === 0) return false;
    return tickets.every((t) => selectedTicketIds.has(t.id));
  }, [tickets, selectedTicketIds]);

  const someSelected = useMemo(() => {
    return selectedTicketIds.size > 0 && !allSelected;
  }, [selectedTicketIds, allSelected]);

  const canBatch = user?.role === 'admin' || user?.role === 'technician';
  const canBatchPriority = user?.role === 'admin';
  const canBatchException = user?.role === 'admin';

  useEffect(() => {
    if (lastBatchResult) {
      setResultModalOpen(true);
    }
  }, [lastBatchResult]);

  const handleToggleAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllTickets(tickets.map((t) => t.id));
    }
  };

  const openBatchModal = (action: BatchAction) => {
    if (selectedTicketIds.size === 0) {
      showToastGlobal('请先选择要处理的工单', 'error');
      return;
    }
    setBatchAction(action);
    setBatchPriorityId('');
    setBatchAssigneeId('');
    setBatchExceptionType('delay');
    setBatchDeadline('');
    setBatchReason('');
    setBatchModalOpen(true);
  };

  const handleBatchSubmit = async () => {
    if (!batchAction || !batchReason.trim()) return;
    const ids = Array.from(selectedTicketIds);
    try {
      let result: BatchOperationResult;
      switch (batchAction) {
        case 'priority':
          if (!batchPriorityId) {
            showToastGlobal('请选择优先级', 'error');
            return;
          }
          result = await batchChangePriority(ids, batchPriorityId, batchReason);
          break;
        case 'assignee':
          if (!batchAssigneeId) {
            showToastGlobal('请选择处理人', 'error');
            return;
          }
          result = await batchChangeAssignee(ids, batchAssigneeId, batchReason);
          break;
        case 'exception_set':
          if (!batchDeadline) {
            showToastGlobal('请设置截止时间', 'error');
            return;
          }
          result = await batchSetException(ids, batchExceptionType, batchReason, batchDeadline);
          break;
        case 'exception_revoke':
          result = await batchRevokeException(ids, batchReason);
          break;
        default:
          return;
      }
      const msg = `批量处理完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`;
      showToastGlobal(result.failed > 0 ? `${msg}（部分失败，请查看详情）` : msg, result.failed > 0 ? 'info' : 'success');
      setBatchModalOpen(false);
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '批量操作失败', 'error');
    }
  };

  const getBatchModalTitle = () => {
    switch (batchAction) {
      case 'priority': return '批量修改优先级';
      case 'assignee': return '批量派工';
      case 'exception_set': return '批量设置催办例外';
      case 'exception_revoke': return '批量撤销催办例外';
      default: return '批量操作';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">工单列表</h1>
          <p className="text-slate-500 text-sm">共 {total} 条工单记录{selectedTicketIds.size > 0 && <span className="ml-2 text-blue-600 font-medium">（已选 {selectedTicketIds.size} 条）</span>}</p>
        </div>
        <button onClick={() => navigate('/submit')} className="btn-primary">
          <Plus className="w-4 h-4" />
          提交报修
        </button>
      </div>

      {canBatch && selectedTicketIds.size > 0 && (
        <div className="card mb-4 p-4 bg-blue-50 border-blue-200">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-blue-900">
              <GripVertical className="w-4 h-4 inline mr-1" />
              已选 {selectedTicketIds.size} 张工单
            </span>
            <div className="flex flex-wrap gap-2 ml-auto">
              {canBatchPriority && (
                <button onClick={() => openBatchModal('priority')} className="btn-secondary text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  改优先级
                </button>
              )}
              <button onClick={() => openBatchModal('assignee')} className="btn-secondary text-xs">
                <User className="w-3.5 h-3.5" />
                改处理人
              </button>
              {canBatchException && (
                <>
                  <button onClick={() => openBatchModal('exception_set')} className="btn-secondary text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                    <Shield className="w-3.5 h-3.5" />
                    设置催办例外
                  </button>
                  <button onClick={() => openBatchModal('exception_revoke')} className="btn-secondary text-xs bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100">
                    <Shield className="w-3.5 h-3.5" />
                    撤销催办例外
                  </button>
                </>
              )}
              <button onClick={clearSelection} className="btn-secondary text-xs">
                <XCircle className="w-3.5 h-3.5" />
                清空选择
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {canBatch && (
                    <th className="text-left px-4 py-3 w-12">
                      <button onClick={handleToggleAll} className="text-slate-500 hover:text-slate-700">
                        {allSelected ? <CheckSquare className="w-5 h-5 text-blue-600" fill="currentColor" /> : someSelected ? <CheckSquare className="w-5 h-5 text-blue-400" /> : <Square className="w-5 h-5" />}
                      </button>
                    </th>
                  )}
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">工单信息</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">位置</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">优先级</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Megaphone className="w-3 h-3 text-rose-500" />催办</span>
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">处理人</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">提交时间</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((ticket) => {
                  const isSelected = selectedTicketIds.has(ticket.id);
                  return (
                    <tr
                      key={ticket.id}
                      className={`hover:bg-slate-50/50 transition-colors ${ticket.isEscalated ? 'bg-rose-50/40' : ''} ${isSelected ? 'bg-blue-50/60' : ''}`}
                    >
                      {canBatch && (
                        <td className="px-4 py-4">
                          <button onClick={() => toggleSelectTicket(ticket.id)} className="text-slate-500 hover:text-slate-700">
                            {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" fill="currentColor" /> : <Square className="w-5 h-5" />}
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-slate-900 text-sm">{ticket.asset?.name || '未知设备'}</p>
                            {ticket.isEscalated && (
                              <span className={`badge ${getEscalationBadgeClass()} text-[10px] py-0.5 px-1.5`} title={ticket.escalationReason}>
                                <Megaphone className="w-3 h-3 inline mr-0.5" />催办中
                              </span>
                            )}
                            {ticket.escalationException && !ticket.isEscalated && (
                              <span className={`badge ${getExceptionBadgeClass(ticket.escalationException.type)} text-[10px] py-0.5 px-1.5`} title={ticket.escalationException.reason}>
                                <Shield className="w-3 h-3 inline mr-0.5" />{ticket.escalationException.type === 'delay' ? '延后' : '免催'}
                              </span>
                            )}
                          </div>
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
                        {ticket.escalationException && !ticket.isEscalated ? (
                          <div className="space-y-1">
                            <p className={`text-xs font-medium ${ticket.escalationException.type === 'delay' ? 'text-amber-700' : 'text-teal-700'}`}>
                              <Shield className="w-3 h-3 inline mr-0.5" />
                              {ticket.escalationException.type === 'delay' ? '延后催办' : '免催办'}
                            </p>
                            <p className="text-xs text-slate-500 line-clamp-1 max-w-[200px]" title={ticket.escalationException.reason}>
                              原因：{ticket.escalationException.reason}
                            </p>
                            <p className="text-xs text-slate-500">
                              截止：{formatDateTime(ticket.escalationException.deadline)}
                            </p>
                          </div>
                        ) : ticket.isEscalated ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-rose-700">
                              催办时间：{ticket.escalatedAt ? formatDateTime(ticket.escalatedAt) : '-'}
                            </p>
                            <p className="text-xs text-rose-600 line-clamp-1 max-w-[200px]" title={ticket.escalationReason}>
                              升级原因：{ticket.escalationReason || '-'}
                            </p>
                            {ticket.escalationOwner && (
                              <p className="text-xs text-rose-600 flex items-center gap-1">
                                <User className="w-3 h-3" />督办：{ticket.escalationOwner.name}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        {ticket.escalationExceptions && ticket.escalationExceptions.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            历史记录 {ticket.escalationExceptions.length} 条
                          </p>
                        )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={batchModalOpen} onClose={() => setBatchModalOpen(false)} title={getBatchModalTitle()} size="lg">
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">将对 <span className="font-bold">{selectedTicketIds.size}</span> 张工单执行此操作</p>
            <p className="text-xs">系统会逐条校验每张工单的状态和权限，不符合条件的会被跳过并在结果中说明原因。</p>
          </div>

          {batchAction === 'priority' && (
            <div>
              <label className="label">目标优先级 <span className="text-rose-500">*</span></label>
              <select className="select" value={batchPriorityId} onChange={(e) => setBatchPriorityId(e.target.value)}>
                <option value="">请选择优先级</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {batchAction === 'assignee' && (
            <div>
              <label className="label">处理人 <span className="text-rose-500">*</span></label>
              <select className="select" value={batchAssigneeId} onChange={(e) => setBatchAssigneeId(e.target.value)}>
                <option value="">请选择处理人</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}（{t.role === 'admin' ? '管理员' : '技术员'}）</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">只有「待派工」「处理中」「重新打开」状态的工单可以批量派工；派工后状态会自动转为处理中。</p>
            </div>
          )}

          {batchAction === 'exception_set' && (
            <>
              <div>
                <label className="label">例外类型 <span className="text-rose-500">*</span></label>
                <select className="select" value={batchExceptionType} onChange={(e) => setBatchExceptionType(e.target.value as EscalationExceptionType)}>
                  <option value="delay">延后催办（暂时推迟）</option>
                  <option value="exempt">免催办（临时免除）</option>
                </select>
              </div>
              <div>
                <label className="label">截止时间 <span className="text-rose-500">*</span></label>
                <input type="datetime-local" className="input" value={batchDeadline} onChange={(e) => setBatchDeadline(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">如果工单当前已在催办状态，设置例外会自动撤销催办。</p>
              </div>
            </>
          )}

          {batchAction === 'exception_revoke' && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
              <p className="text-xs">撤销后系统将立即对每张工单重新评估是否需要触发催办。</p>
            </div>
          )}

          <div>
            <label className="label">操作原因 <span className="text-rose-500">*</span></label>
            <textarea
              className="input resize-none h-24"
              placeholder="请填写本次批量操作的原因，将记录到每张工单的时间线..."
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setBatchModalOpen(false)} className="btn-secondary">取消</button>
            <button
              onClick={handleBatchSubmit}
              disabled={!batchReason.trim() || (batchAction === 'priority' && !batchPriorityId) || (batchAction === 'assignee' && !batchAssigneeId) || (batchAction === 'exception_set' && !batchDeadline)}
              className="btn-primary"
            >
              确认批量处理
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={resultModalOpen} onClose={() => { setResultModalOpen(false); clearLastBatchResult(); }} title="批量处理结果" size="lg">
        {lastBatchResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-slate-900">{lastBatchResult.total}</p>
                <p className="text-xs text-slate-500 mt-1">处理总数</p>
              </div>
              <div className="p-4 bg-emerald-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-emerald-700">{lastBatchResult.succeeded}</p>
                <p className="text-xs text-emerald-600 mt-1">成功</p>
              </div>
              <div className="p-4 bg-rose-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-rose-700">{lastBatchResult.failed}</p>
                <p className="text-xs text-rose-600 mt-1">失败</p>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">工单ID</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">状态</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lastBatchResult.results.map((r) => (
                    <tr key={r.ticketId}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{r.ticketId}</td>
                      <td className="px-4 py-2">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />成功
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <XCircle className="w-4 h-4" />失败
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {r.success ? '已更新' : r.error || '未知错误'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button onClick={() => { setResultModalOpen(false); clearLastBatchResult(); }} className="btn-primary">
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
