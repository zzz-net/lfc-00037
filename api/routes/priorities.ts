import { Router, type Response } from 'express';
import { getPriorities, updatePriorities, persist } from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';
import type { Priority } from '../../shared/types.js';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  const priorities = getPriorities();
  res.json({ success: true, data: { priorities } });
});

router.put('/', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { priorities } = req.body as { priorities: Priority[] };
  if (!Array.isArray(priorities) || priorities.length === 0) {
    res.status(400).json({ success: false, error: '优先级配置不能为空' });
    return;
  }
  for (const p of priorities) {
    if (!p.name || !p.name.trim()) {
      res.status(400).json({ success: false, error: '优先级名称不能为空' });
      return;
    }
    if (!p.color || !/^#[0-9A-Fa-f]{6}$/.test(p.color)) {
      res.status(400).json({ success: false, error: '优先级颜色格式不正确' });
      return;
    }
  }
  const updated = updatePriorities(priorities);
  persist();
  res.json({ success: true, data: { priorities: updated } });
});

export default router;
