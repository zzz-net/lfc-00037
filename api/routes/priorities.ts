import { Router, type Response } from 'express';
import {
  getPriorities,
  updatePriorities,
  persist,
  getUsers,
} from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import type { Priority } from '../../shared/types.js';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  const priorities = getPriorities();
  const allUsers = getUsers();
  const escalationCandidates = allUsers
    .filter((u) => u.role === 'admin' || u.role === 'technician')
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
  res.json({ success: true, data: { priorities, escalationCandidates } });
});

router.put('/', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { priorities } = req.body as { priorities: Priority[] };
  if (!Array.isArray(priorities) || priorities.length === 0) {
    res.status(400).json({ success: false, error: '优先级配置不能为空' });
    return;
  }
  const validOwners = new Set(
    getUsers()
      .filter((u) => u.role === 'admin' || u.role === 'technician')
      .map((u) => u.id)
  );
  for (const p of priorities) {
    if (!p.name || !p.name.trim()) {
      res.status(400).json({ success: false, error: '优先级名称不能为空' });
      return;
    }
    if (!p.color || !/^#[0-9A-Fa-f]{6}$/.test(p.color)) {
      res.status(400).json({ success: false, error: '优先级颜色格式不正确' });
      return;
    }
    const minutes = Number(p.responseTimeMinutes);
    if (p.responseTimeMinutes !== undefined && p.responseTimeMinutes !== null) {
      if (!Number.isFinite(minutes) || minutes < 0) {
        res.status(400).json({ success: false, error: `优先级「${p.name}」响应时限必须为非负整数分钟` });
        return;
      }
    }
    if (p.escalationOwnerId && !validOwners.has(p.escalationOwnerId)) {
      res.status(400).json({ success: false, error: `优先级「${p.name}」升级负责人不存在或无权限` });
      return;
    }
  }
  const normalized = priorities.map((p) => ({
    ...p,
    responseTimeMinutes: p.responseTimeMinutes !== undefined && p.responseTimeMinutes !== null
      ? Number(p.responseTimeMinutes)
      : 0,
    escalationOwnerId: p.escalationOwnerId || undefined,
  }));
  const updated = updatePriorities(normalized);
  persist();
  res.json({ success: true, data: { priorities: updated } });
});

export default router;
