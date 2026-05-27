const express    = require('express');
const router     = express.Router();
const controller = require('./stock-allocation.controller');
const { authenticate }  = require('../../middleware/auth.middleware');
const { authorize }     = require('../../middleware/role.middleware');
const { validate }      = require('../../middleware/validate.middleware');
const {
  createAllocationSchema,
  getAllocationsQuerySchema,
} = require('./stock-allocation.validator');
const ROLES = require('../../constants/roles');

// All stock-allocation routes require authentication
router.use(authenticate);

/**
 * POST   /stock-allocations            → super_admin only
 * GET    /stock-allocations            → super_admin, barangay_admin
 * GET    /stock-allocations/:id        → super_admin, barangay_admin
 * GET    /stock-allocations/summary/:barangay_id → super_admin, barangay_admin
 */
router.post(
  '/',
  authorize([ROLES.SUPER_ADMIN]),
  validate(createAllocationSchema),
  controller.createAllocation
);

router.get(
  '/',
  authorize([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  validate(getAllocationsQuerySchema, 'query'),
  controller.getAllocations
);

// NOTE: /summary/:barangay_id must be declared BEFORE /:allocation_id
// to avoid Express matching "summary" as an allocation_id param.
router.get(
  '/summary/:barangay_id',
  authorize([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  controller.getAllocationSummary
);

router.get(
  '/:allocation_id',
  authorize([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  controller.getAllocationById
);

module.exports = router;