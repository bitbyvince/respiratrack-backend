import express from 'express';
import * as controller from './alert.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createAlertSchema, resolveAlertSchema } from './alert.validator.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  validate(createAlertSchema),
  controller.createAlert,
);

router.post(
  '/check-escalations',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.checkEscalations,
);

router.get(
  '/',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.getAlerts,
);

router.get(
  '/:alertId',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.getAlert,
);

router.get(
  '/barangay/:barangayId',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.getBarangayAlerts,
);

router.get(
  '/patient/:patientId',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.getPatientAlerts,
);

router.patch(
  '/:alertId/resolve',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  validate(resolveAlertSchema),
  controller.resolveAlert,
);

router.patch(
  '/:alertId/acknowledge',
  authenticate,
  authorizeRoles('nurse', 'barangay_admin', 'super_admin', 'patc'),
  controller.acknowledgeAlert,
);

export default router;