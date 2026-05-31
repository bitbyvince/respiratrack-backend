import { Router } from 'express';
import * as patientController from './patient.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { roleMiddleware } from '../../middleware/role.middleware.js';
import ROLES from '../../constants/roles.js';
import {
  registerPatientSchema,
  updatePatientSchema,
  updateTreatmentOutcomeSchema,
  updateSputumScheduleSchema,
  listPatientsSchema,
} from './patient.validator.js';

const router = Router();
router.use(authMiddleware);

// Static routes first (must come before /:patient_id to avoid param conflicts)
router.get(
  '/',
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  validate(listPatientsSchema, 'query'),
  patientController.listPatients,
);
router.get('/me', roleMiddleware(ROLES.PATIENT), patientController.getMyPatientProfile);
router.get(
  '/export/pdf',  // ← Moved up from bottom (fix from Tablet branch)
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN),
  patientController.exportPatientsPdf,
);

// Dynamic routes (/:patient_id must come after all static routes)
router.get(
  '/:patient_id',
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  patientController.getPatient,
);
router.post(
  '/',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  validate(registerPatientSchema),
  patientController.registerPatient,
);
router.patch(
  '/:patient_id',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN),
  validate(updatePatientSchema),
  patientController.updatePatient,
);
router.patch(
  '/:patient_id/status',  // ← Web-only route, kept
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN),
  patientController.updatePatientStatus,
);
router.patch(
  '/:patient_id/outcome',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN),
  validate(updateTreatmentOutcomeSchema),
  patientController.updateTreatmentOutcome,
);
router.patch(
  '/:patient_id/sputum-schedule',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  validate(updateSputumScheduleSchema),
  patientController.updateSputumSchedule,
);
router.patch(
  '/:patient_id/deactivate',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN),
  patientController.deactivatePatient,
);
router.patch(
  '/:patient_id/reactivate',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN),
  patientController.reactivatePatient,
);

export default router;