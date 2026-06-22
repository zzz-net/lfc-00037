import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  User,
  Calendar,
  AlertCircle,
  MessageSquare,
  UserCheck,
  Clock,
  RotateCcw,
  Pause,
  Package,
  CheckCircle2,
  Play,
  Send,
  Megaphone,
  Undo2,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { useTicketStore, useConfigStore, useAuthStore } from '../store';
import { getStatusBadgeClass, getStatusLabel, formatDateTime, getEscalationBadgeClass, getExceptionBadgeClass } from '../utils/helpers';
import Modal from '../components/common/Modal';
import { showToastGlobal } from '../components/layout/MainLayout';
import type { TicketStatus } from '../../shared/types';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTicket, timeline, escalationRecords, escalationExceptions, fetchTicketDetail, assignTicket, updateTicketStatus, addNote, revokeEscalation, createEscalationException, revokeEscalationException, isLoading } = useTicketStore();
  const { technicians } = useConfigStore();
  const { user } = useAuthStore();

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [noteText, setNoteText] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [deEscalateModalOpen, setDeEscalateModalOpen] = useState(false);
  const [deEscalateReason, setDeEscalateReason] = useState('');
  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [exceptionType, setExceptionType] = useState<'delay' | 'exempt'>('delay');
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionDeadline, setExceptionDeadline] = useState('');
  const [revokeExceptionModalOpen, setRevokeExceptionModalOpen] = useState(false);
  const [revokeExceptionReason, setRevokeExceptionReason] = useState('');

  useEffect(() => {
    if (id) fetchTicketDetail(id);
  }, [id, fetchTicketDetail]);

  const handleAssign = async () => {
    if (!id || !selectedTechnician) return;
    try {
      await assignTicket(id, selectedTechnician, assignNote);
      showToastGlobal('派工成功', 'success');
      setAssignModalOpen(false);
      setSelectedTechnician('');
      setAssignNote('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '派工失败', 'error');
    }
  };

  const handleStatusChange = async (status: TicketStatus) => {
    if (!id) return;
    try {
      await updateTicketStatus(id, status, actionNote || undefined);
      showToastGlobal('状态更新成功', 'success');
      setActionNote('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleReopen = async () => {
    if (!id || !reopenReason.trim()) return;
    try {
      await updateTicketStatus(id, 'reopened', undefined, reopenReason);
      showToastGlobal('工单已重新打开', 'success');
      setReopenModalOpen(false);
      setReopenReason('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleAddNote = async () => {
    if (!id || !noteText.trim()) return;
    try {
      await addNote(id, noteText);
      showToastGlobal('备注已添加', 'success');
      setNoteText('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '添加备注失败', 'error');
    }
  };

  const handleDeEscalate = async () => {
    if (!id || !deEscalateReason.trim()) return;
    try {
      await revokeEscalation(id, deEscalateReason);
      showToastGlobal('催办已撤销', 'success');
      setDeEscalateModalOpen(false);
      setDeEscalateReason('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '撤销失败', 'error');
    }
  };

  const handleCreateException = async () => {
    if (!id || !exceptionReason.trim() || !exceptionDeadline) return;
    try {
      await createEscalationException(id, exceptionType, exceptionReason, exceptionDeadline);
      showToastGlobal(exceptionType === 'delay' ? '已设置延后催办' : '已设置免催办', 'success');
      setExceptionModalOpen(false);
      setExceptionReason('');
      setExceptionDeadline('');
      setExceptionType('delay');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '设置催办例外失败', 'error');
    }
  };

  const handleRevokeException = async () => {
    if (!id || !revokeExceptionReason.trim()) return;
    try {
      await revokeEscalationException(id, revokeExceptionReason);
      showToastGlobal('催办例外已撤销，系统将重新评估催办', 'success');
      setRevokeExceptionModalOpen(false);
      setRevokeExceptionReason('');
    } catch (err) {
      showToastGlobal(err instanceof Error ? err.message : '撤销催办例外失败', 'error');
    }
  };

  const canAssign = user?.role === 'admin' || user?.role === 'technician';
  const canClose = user?.role === 'admin' || user?.role === 'technician';
  const canReopen = user?.role === 'admin';
  const canDeEscalate = user?.role === 'admin';
  const canSetException = user?.role === 'admin';
  const isAssignedToCurrent = currentTicket?.assigneeId === user?.id || user?.role === 'admin';

  if (!currentTicket && !isLoading) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-4">工单不存在</p>
        <button onClick={() => navigate('/')} className="btn-secondary">返回看板</button>
      </div>
    );
  }

  if (isLoading && !currentTicket) {
    return <div className="text-center py-16 text-slate-500">加载中...</div>;
  }

  const t = currentTicket!;

  const availableActions: Array<{ status: TicketStatus; label: string; icon: typeof Play; style: string }> = [];
  if (t.status === 'pending' || t.status === 'reopened') {
    availableActions.push({ status: 'processing', label: '开始处理', icon: Play, style: 'btn-primary' });
  }
  if (t.status === 'processing' || t.status === 'reopened') {
    availableActions.push({ status: 'waiting_parts', label: '等待配件', icon: Package, style: 'btn-secondary' });
    availableActions.push({ status: 'paused', label: '暂停', icon: Pause, style: 'btn-secondary' });
    if (canClose) availableActions.push({ status: 'completed', label: '完成', icon: CheckCircle2, style: 'btn-success' });
  }
  if (t.status === 'waiting_parts') {
    availableActions.push({ status: 'processing', label: '恢复处理', icon: Play, style: 'btn-primary' });
    availableActions.push({ status: 'paused', label: '暂停', icon: Pause, style: 'btn-secondary' });
  }
  if (t.status === 'paused') {
    availableActions.push({ status: 'processing', label: '恢复处理', icon: Play, style: 'btn-primary' });
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        返回
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className={`card p-6 ${t.isEscalated ? 'ring-2 ring-rose-300 border-rose-300' : ''}`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`badge ${getStatusBadgeClass(t.status)}`}>
                    {getStatusLabel(t.status)}
                  </span>
                  {t.priority && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: t.priority.color }}>
                      <AlertCircle className="w-4 h-4" />
                      {t.priority.name}优先级
                    </span>
                  )}
                  {t.isEscalated && (
                    <span className={`badge ${getEscalationBadgeClass()} flex items-center gap-1`} title={t.escalationReason}>
                      <Megaphone className="w-3.5 h-3.5" />
                      催办升级中
                    </span>
                  )}
                  {t.escalationException && !t.isEscalated && (
                    <span className={`badge ${getExceptionBadgeClass(t.escalationException.type)} flex items-center gap-1`} title={t.escalationException.reason}>
                      <Shield className="w-3.5 h-3.5" />
                      {t.escalationException.type === 'delay' ? '延后催办' : '免催办'}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-slate-900">{t.asset?.name || '未知设备'}</h1>
                <p className="text-sm text-slate-500 font-mono">{t.asset?.code}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canDeEscalate && t.isEscalated && (
                  <button onClick={() => setDeEscalateModalOpen(true)} className="btn-secondary bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100">
                    <Undo2 className="w-4 h-4" />
                    撤销催办
                  </button>
                )}
                {canSetException && !t.escalationException && t.status !== 'completed' && (
                  <button onClick={() => setExceptionModalOpen(true)} className="btn-secondary bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                    <Shield className="w-4 h-4" />
                    催办例外
                  </button>
                )}
                {canSetException && t.escalationException && (
                  <button onClick={() => setRevokeExceptionModalOpen(true)} className="btn-secondary bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100">
                    <ShieldOff className="w-4 h-4" />
                    撤销例外
                  </button>
                )}
                {canAssign && (t.status === 'pending' || t.status === 'reopened') && (
                  <button onClick={() => setAssignModalOpen(true)} className="btn-primary">
                    <UserCheck className="w-4 h-4" />
                    派工
                  </button>
                )}
                {canReopen && t.status === 'completed' && (
                  <button onClick={() => setReopenModalOpen(true)} className="btn-secondary">
                    <RotateCcw className="w-4 h-4" />
                    重新打开
                  </button>
                )}
              </div>
            </div>

            {t.isEscalated && (
              <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <h4 className="font-semibold text-rose-800 mb-2 flex items-center gap-2">
                  <Megaphone className="w-4 h-4" />
                  催办升级信息
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-rose-500 mb-0.5">催办时间</p>
                    <p className="font-medium text-rose-900">{t.escalatedAt ? formatDateTime(t.escalatedAt) : '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-rose-500 mb-0.5">升级原因</p>
                    <p className="font-medium text-rose-900">{t.escalationReason || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-rose-500 mb-0.5">升级负责人</p>
                    <p className="font-medium text-rose-900 flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {t.escalationOwner?.name || '-'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {t.escalationException && (
              <div className={`mb-4 p-4 rounded-xl border ${t.escalationException.type === 'delay' ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'}`}>
                <h4 className={`font-semibold mb-2 flex items-center gap-2 ${t.escalationException.type === 'delay' ? 'text-amber-800' : 'text-teal-800'}`}>
                  <Shield className="w-4 h-4" />
                  催办例外 — {t.escalationException.type === 'delay' ? '延后催办' : '免催办'}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="col-span-2">
                    <p className={`text-xs mb-0.5 ${t.escalationException.type === 'delay' ? 'text-amber-500' : 'text-teal-500'}`}>原因</p>
                    <p className={`font-medium ${t.escalationException.type === 'delay' ? 'text-amber-900' : 'text-teal-900'}`}>{t.escalationException.reason}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-0.5 ${t.escalationException.type === 'delay' ? 'text-amber-500' : 'text-teal-500'}`}>截止时间</p>
                    <p className={`font-medium ${t.escalationException.type === 'delay' ? 'text-amber-900' : 'text-teal-900'}`}>{formatDateTime(t.escalationException.deadline)}</p>
                  </div>
                  <div>
                    <p className={`text-xs mb-0.5 ${t.escalationException.type === 'delay' ? 'text-amber-500' : 'text-teal-500'}`}>设置时间</p>
                    <p className={`font-medium ${t.escalationException.type === 'delay' ? 'text-amber-900' : 'text-teal-900'}`}>{formatDateTime(t.escalationException.createdAt)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">位置</p>
                  <p className="text-sm text-slate-900 font-medium">{t.location}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">报修人</p>
                  <p className="text-sm text-slate-900 font-medium">{t.submitter?.name || '-'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <UserCheck className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">处理人</p>
                  <p className="text-sm text-slate-900 font-medium">{t.assignee?.name || '待派工'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">提交时间</p>
                  <p className="text-sm text-slate-900 font-medium">{formatDateTime(t.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-xs text-slate-500 mb-2">问题描述</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{t.description}</p>
            </div>

            {t.reopenReason && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-700 mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5" />
                  重新打开原因
                </p>
                <p className="text-sm text-orange-800">{t.reopenReason}</p>
              </div>
            )}
          </div>

          {availableActions.length > 0 && isAssignedToCurrent && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4">执行操作</h3>
              <div className="space-y-3">
                <textarea
                  className="input resize-none h-20"
                  placeholder="添加操作备注（可选）"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {availableActions.map((action) => (
                    <button
                      key={action.status}
                      onClick={() => handleStatusChange(action.status)}
                      className={action.style}
                    >
                      <action.icon className="w-4 h-4" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {t.status !== 'completed' && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4">添加备注</h3>
              <div className="space-y-3">
                <textarea
                  className="input resize-none h-24"
                  placeholder="输入备注内容..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="flex justify-end">
                  <button onClick={handleAddNote} disabled={!noteText.trim()} className="btn-primary">
                    <Send className="w-4 h-4" />
                    发送备注
                  </button>
                </div>
              </div>
            </div>
          )}
          {t.status === 'completed' && !canReopen && (
            <div className="card p-6">
              <div className="text-center py-4">
                <p className="text-sm text-slate-500">工单已关闭，无法继续操作</p>
                <p className="text-xs text-slate-400 mt-1">如需继续处理，请联系管理员重新打开</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              处理时间线
            </h3>
            <div className="space-y-4">
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">暂无记录</p>
              ) : (
                timeline.map((event, idx) => (
                  <div key={event.id} className="relative pl-6">
                    {idx < timeline.length - 1 && (
                      <div className="absolute left-2 top-6 bottom-0 w-px bg-slate-200" />
                    )}
                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-4 ${
                      event.type === 'reopened' ? 'bg-orange-500 border-orange-100' :
                      event.type === 'created' ? 'bg-green-500 border-green-100' :
                      event.type === 'assigned' ? 'bg-indigo-500 border-indigo-100' :
                      event.type === 'escalated' ? 'bg-rose-500 border-rose-100' :
                      event.type === 'de_escalated' ? 'bg-purple-500 border-purple-100' :
                      event.type === 'escalation_exception_created' ? 'bg-amber-500 border-amber-100' :
                      event.type === 'escalation_exception_revoked' ? 'bg-teal-500 border-teal-100' :
                      event.type === 'batch_priority_changed' ? 'bg-blue-500 border-blue-100' :
                      event.type === 'batch_assignee_changed' ? 'bg-indigo-600 border-indigo-100' :
                      event.type === 'batch_exception_set' ? 'bg-amber-600 border-amber-100' :
                      event.type === 'batch_exception_revoked' ? 'bg-teal-600 border-teal-100' :
                      'bg-blue-500 border-blue-100'
                    }`} />
                    <div className={`rounded-lg p-3 ${
                      event.type === 'escalated' ? 'bg-rose-50 border border-rose-100' :
                      event.type === 'de_escalated' ? 'bg-purple-50 border border-purple-100' :
                      event.type === 'escalation_exception_created' ? 'bg-amber-50 border border-amber-100' :
                      event.type === 'escalation_exception_revoked' ? 'bg-teal-50 border border-teal-100' :
                      event.type === 'batch_priority_changed' ? 'bg-blue-50 border border-blue-100' :
                      event.type === 'batch_assignee_changed' ? 'bg-indigo-50 border border-indigo-100' :
                      event.type === 'batch_exception_set' ? 'bg-amber-50 border border-amber-100' :
                      event.type === 'batch_exception_revoked' ? 'bg-teal-50 border border-teal-100' :
                      'bg-slate-50'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-900">{event.user?.name || '系统'}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                      </div>
                      <p className={`text-sm ${
                        event.type === 'reopened' ? 'text-orange-700 font-medium' :
                        event.type === 'escalated' ? 'text-rose-700 font-medium' :
                        event.type === 'de_escalated' ? 'text-purple-700 font-medium' :
                        event.type === 'escalation_exception_created' ? 'text-amber-700 font-medium' :
                        event.type === 'escalation_exception_revoked' ? 'text-teal-700 font-medium' :
                        event.type === 'batch_priority_changed' ? 'text-blue-700 font-medium' :
                        event.type === 'batch_assignee_changed' ? 'text-indigo-700 font-medium' :
                        event.type === 'batch_exception_set' ? 'text-amber-700 font-medium' :
                        event.type === 'batch_exception_revoked' ? 'text-teal-700 font-medium' :
                        'text-slate-600'
                      }`}>
                        {event.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {escalationExceptions.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-slate-400" />
                催办例外记录
              </h3>
              <div className="space-y-3">
                {escalationExceptions.map((exc) => {
                  const isExpired = new Date(exc.deadline).getTime() <= Date.now();
                  const isRevoked = !!exc.revokedAt;
                  const isActive = !isRevoked && !isExpired;
                  return (
                    <div key={exc.id} className={`rounded-lg p-3 text-sm border ${
                      isActive
                        ? exc.type === 'delay' ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'
                        : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge ${getExceptionBadgeClass(exc.type)} text-[10px] py-0.5 px-1.5`}>
                          {exc.type === 'delay' ? '延后催办' : '免催办'}
                        </span>
                        <span className={`text-xs font-medium ${
                          isActive ? 'text-green-700' : isRevoked ? 'text-slate-500' : 'text-orange-600'
                        }`}>
                          {isActive ? '● 生效中' : isRevoked ? '已撤销' : '已过期'}
                        </span>
                      </div>
                      <p className="text-slate-700 mb-1">原因：{exc.reason}</p>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>截止：{formatDateTime(exc.deadline)}</span>
                        <span>设置：{formatDateTime(exc.createdAt)}</span>
                      </div>
                      {isRevoked && (
                        <div className="mt-1 text-xs text-slate-500">
                          <span>撤销时间：{formatDateTime(exc.revokedAt!)}</span>
                          {exc.revokeReason && <span>，撤销原因：{exc.revokeReason}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-slate-400" />
              快捷提示
            </h3>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                「等待配件」状态的工单不能直接完成，需先恢复为处理中
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                已完成的工单不能派工、备注或更新状态
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                只有管理员可重新打开已完成工单，且必须填写原因
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                重新打开后，方可继续派工、备注和状态变更
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                读者/馆员无权关闭工单
              </li>
            </ul>
          </div>
        </div>
      </div>

      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="分派技术员">
        <div className="space-y-4">
          <div>
            <label className="label">选择技术员</label>
            <select className="select" value={selectedTechnician} onChange={(e) => setSelectedTechnician(e.target.value)}>
              <option value="">请选择技术员</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">派工备注（可选）</label>
            <textarea
              className="input resize-none h-24"
              placeholder="输入派工说明..."
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAssignModalOpen(false)} className="btn-secondary">取消</button>
            <button onClick={handleAssign} disabled={!selectedTechnician} className="btn-primary">确认派工</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={reopenModalOpen} onClose={() => setReopenModalOpen(false)} title="重新打开工单">
        <div className="space-y-4">
          <div>
            <label className="label">重新打开原因</label>
            <textarea
              className="input resize-none h-28"
              placeholder="请详细说明重新打开的原因..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setReopenModalOpen(false)} className="btn-secondary">取消</button>
            <button onClick={handleReopen} disabled={!reopenReason.trim()} className="btn-primary">确认打开</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={deEscalateModalOpen} onClose={() => setDeEscalateModalOpen(false)} title="撤销催办升级">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-medium mb-1">撤销将产生以下影响：</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>清除工单的「催办中」状态标记</li>
              <li>在时间线中记录撤销操作（含撤销原因）</li>
              <li>后续若仍超时，系统会重新触发催办</li>
            </ul>
          </div>
          <div>
            <label className="label">撤销原因 <span className="text-rose-500">*</span></label>
            <textarea
              className="input resize-none h-28"
              placeholder="请填写撤销催办的原因，例如：误判、已临时处理等..."
              value={deEscalateReason}
              onChange={(e) => setDeEscalateReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeEscalateModalOpen(false)} className="btn-secondary">取消</button>
            <button onClick={handleDeEscalate} disabled={!deEscalateReason.trim()} className="btn-primary bg-rose-600 hover:bg-rose-700">
              <Undo2 className="w-4 h-4" />
              确认撤销
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={exceptionModalOpen} onClose={() => setExceptionModalOpen(false)} title="设置催办例外">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-medium mb-1">催办例外说明：</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li><strong>延后催办</strong>：暂时推迟催办，到截止时间后恢复自动催办</li>
              <li><strong>免催办</strong>：临时免除催办，到截止时间后恢复自动催办</li>
              <li>设置例外后，系统在例外期间不会自动触发催办</li>
              <li>如果工单当前处于催办状态，设置例外将自动撤销催办</li>
              <li>例外到期或被撤销后，系统将重新评估是否触发催办</li>
            </ul>
          </div>
          <div>
            <label className="label">例外类型 <span className="text-rose-500">*</span></label>
            <select
              className="select"
              value={exceptionType}
              onChange={(e) => setExceptionType(e.target.value as 'delay' | 'exempt')}
            >
              <option value="delay">延后催办（暂时推迟）</option>
              <option value="exempt">免催办（临时免除）</option>
            </select>
          </div>
          <div>
            <label className="label">原因 <span className="text-rose-500">*</span></label>
            <textarea
              className="input resize-none h-24"
              placeholder="请填写设置例外的原因，例如：已联系供应商等待确认..."
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
            />
          </div>
          <div>
            <label className="label">截止时间 <span className="text-rose-500">*</span></label>
            <input
              type="datetime-local"
              className="input"
              value={exceptionDeadline}
              onChange={(e) => setExceptionDeadline(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">截止时间之后，系统将恢复自动催办判断</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setExceptionModalOpen(false)} className="btn-secondary">取消</button>
            <button onClick={handleCreateException} disabled={!exceptionReason.trim() || !exceptionDeadline} className="btn-primary bg-amber-600 hover:bg-amber-700">
              <Shield className="w-4 h-4" />
              确认设置
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={revokeExceptionModalOpen} onClose={() => setRevokeExceptionModalOpen(false)} title="撤销催办例外">
        <div className="space-y-4">
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
            <p className="font-medium mb-1">撤销例外将产生以下影响：</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>立即恢复该工单的自动催办判断</li>
              <li>如果工单已超时，系统将在下次读取时重新触发催办</li>
              <li>在时间线中记录撤销操作（含撤销原因）</li>
            </ul>
          </div>
          <div>
            <label className="label">撤销原因 <span className="text-rose-500">*</span></label>
            <textarea
              className="input resize-none h-24"
              placeholder="请填写撤销例外的原因..."
              value={revokeExceptionReason}
              onChange={(e) => setRevokeExceptionReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRevokeExceptionModalOpen(false)} className="btn-secondary">取消</button>
            <button onClick={handleRevokeException} disabled={!revokeExceptionReason.trim()} className="btn-primary bg-teal-600 hover:bg-teal-700">
              <ShieldOff className="w-4 h-4" />
              确认撤销
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
