import { Router, type Request, type Response } from 'express';
import { findUserByUsername, findUserById, toPublicUser } from '../data/store.js';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    return;
  }
  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    res.status(401).json({ success: false, error: '用户名或密码错误' });
    return;
  }
  res.json({
    success: true,
    data: {
      token: user.id,
      user: toPublicUser(user),
    },
  });
});

router.get('/me', (req: Request, res: Response): void => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    res.status(401).json({ success: false, error: '未登录' });
    return;
  }
  const user = findUserById(userId);
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在' });
    return;
  }
  res.json({
    success: true,
    data: { user: toPublicUser(user) },
  });
});

export default router;
