import { Router } from 'express';
import * as controller from './escalation.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeRoles } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  triggerEscalationSchema,
  acknowledgeEscalationSchema,
  resolveEscalationSchema,
  listEscalationsSchema,
} from './escalation.validator.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC];
const ADMIN_ONLY = [ROLES.SUPER_ADMIN, ROLES.PATC];

router.post(
  '/trigger',
  authenticate,
  authorizeRoles(...ADMIN_ONLY),
  validate(triggerEscalationSchema),
  controller.triggerEscalation,
);

router.get(
  '/',
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(listEscalationsSchema, 'query'),
  controller.listEscalations,
);

router.get('/:escalationId', authenticate, authorizeRoles(...ALL_STAFF), controller.getEscalation);

router.patch(
  '/:escalationId/acknowledge',
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(acknowledgeEscalationSchema),
  controller.acknowledgeEscalation,
);

router.patch(
  '/:escalationId/resolve',
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(resolveEscalationSchema),
  controller.resolveEscalation,
);

export default router;