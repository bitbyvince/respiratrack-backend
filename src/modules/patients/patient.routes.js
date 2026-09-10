import { Router } from 'express';
import * as patientController from './patient.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { roleMiddleware } from '../../middleware/role.middleware.js';
import ROLES from '../../constants/roles.js';
import {
  registerPatientSchema,
  updatePatientSchema,
  transferPatientSchema,
  updateContactSchema,
  updateTreatmentOutcomeSchema,
  updateSputumScheduleSchema,
  listPatientsSchema,
} from './patient.validator.js';

const router = Router();
router.use(authMiddleware);

// Static routes first (must come before /:patient_id to avoid param conflicts)
router.get(
  '/',
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  validate(listPatientsSchema, 'query'),
  patientController.listPatients,
);
router.get('/me', roleMiddleware(ROLES.PATIENT), patientController.getMyPatientProfile);
router.patch(
  '/me/contact',
  roleMiddleware(ROLES.PATIENT),
  validate(updateContactSchema),
  patientController.updateMyContact,
);
router.get(
  '/export/pdf',  // ← Moved up from bottom (fix from Tablet branch)
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  patientController.exportPatientsPdf,
);

// Dynamic routes (/:patient_id must come after all static routes)
router.get(
  '/:patient_id',
  roleMiddleware(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  patientController.getPatient,
);
router.post(
  '/',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN, ROLES.PATC),
  validate(registerPatientSchema),
  patientController.registerPatient,
);
router.patch(
  '/:patient_id',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN, ROLES.PATC),
  validate(updatePatientSchema),
  patientController.updatePatient,
);
router.patch(
  '/:patient_id/status',  // ← Web-only route, kept
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN, ROLES.PATC),
  patientController.updatePatientStatus,
);
router.patch(
  '/:patient_id/outcome',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN, ROLES.PATC),
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
  '/:patient_id/transfer',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN, ROLES.PATC),
  validate(transferPatientSchema),
  patientController.transferPatient,
);
router.patch(
  '/:patient_id/deactivate',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN, ROLES.PATC),
  patientController.deactivatePatient,
);
router.patch(
  '/:patient_id/reactivate',
  roleMiddleware(ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN, ROLES.PATC),
  patientController.reactivatePatient,
);

export default router;