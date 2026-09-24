import { Router, Request, Response } from 'express';
import User from '../models/User';
import Order from '@models/Order';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});

router.get('/:id/orders', async (req: Request, res: Response) => {
  const orders = await Order.find({ user: req.params.id }).select('-paymentDetails').lean();
  res.json(orders);
});

export default router;
