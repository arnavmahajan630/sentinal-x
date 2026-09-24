const { Router } = require('express');
const ctrl = require('../controllers/order.controller');
const asyncHandler = require('../middleware/asyncHandler');

const router = Router();

router.get('/mine/:id', ctrl.getMyOrder);
router
  .route('/:id')
  .get(ctrl.getOrder)
  .put(asyncHandler(ctrl.updateOrder))
  .delete(ctrl.deleteOrder);
router.post('/', ctrl.createOrder);

module.exports = router;
