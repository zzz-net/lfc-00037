import { Router, type Response } from 'express';
import {
  getAssets,
  getAssetGroups,
  createAsset,
  updateAsset,
  deleteAsset,
  persist,
} from '../data/store.js';
import { authMiddleware, requireRoles, type AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  const assets = getAssets();
  const groups = getAssetGroups();
  res.json({ success: true, data: { assets, groups } });
});

router.post('/', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { code, name, type, location, groupId } = req.body;
  const errors: string[] = [];
  if (!code || !code.trim()) errors.push('资产编号不能为空');
  if (!name || !name.trim()) errors.push('资产名称不能为空');
  if (!type || !type.trim()) errors.push('资产类型不能为空');
  if (!location || !location.trim()) errors.push('位置信息不能为空');
  if (!groupId) errors.push('请选择资产分组');

  if (errors.length > 0) {
    res.status(400).json({ success: false, error: errors.join('；') });
    return;
  }

  const assets = getAssets();
  if (assets.find((a) => a.code === code.trim())) {
    res.status(400).json({ success: false, error: '资产编号已存在' });
    return;
  }

  const asset = createAsset({
    code: code.trim(),
    name: name.trim(),
    type: type.trim(),
    location: location.trim(),
    groupId,
  });
  persist();
  res.status(201).json({ success: true, data: { asset } });
});

router.put('/:id', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const { code, name, type, location, groupId } = req.body;
  const updated = updateAsset(req.params.id, {
    code: code?.trim(),
    name: name?.trim(),
    type: type?.trim(),
    location: location?.trim(),
    groupId,
  });
  if (!updated) {
    res.status(404).json({ success: false, error: '资产不存在' });
    return;
  }
  persist();
  res.json({ success: true, data: { asset: updated } });
});

router.delete('/:id', authMiddleware, requireRoles('admin'), (req: AuthRequest, res: Response): void => {
  const ok = deleteAsset(req.params.id);
  if (!ok) {
    res.status(404).json({ success: false, error: '资产不存在' });
    return;
  }
  persist();
  res.json({ success: true });
});

export default router;
