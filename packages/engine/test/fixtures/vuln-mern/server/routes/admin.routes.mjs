import { Router } from 'express';
import User from '../models/User.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();
router.use(auditLog);

router.get('/stats', async (req, res) => {
  const count = await User.countDocuments({});
  res.json({ count });
});

router.delete('/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.sendStatus(204);
});

export default router;
