import type { Request, Response, NextFunction } from 'express';
import { findUserById } from '../data/store.js';
import type { User, UserRole } from '../../shared/types.js';

export interface AuthRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const userId = (req.headers['x-user-id'] as string) || (req.query['x-user-id'] as string);
  if (!userId) {
    res.status(401).json({ success: false, error: '未登录，请先登录' });
    return;
  }
  const user = findUserById(userId);
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在' });
    return;
  }
  req.user = user;
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: '权限不足，无法执行此操作' });
      return;
    }
    next();
  };
}
