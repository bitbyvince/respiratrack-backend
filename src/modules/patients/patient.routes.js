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

// ── All routes require authentication ────────────────────
router.use(authMiddleware);

// ================================================================
// LIST & SEARCH
// ================================================================
router.get(
  '/',
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(listPatientsSchema, 'query'),
  patientController.listPatients,
);

// ================================================================
// PATIENT SELF-VIEW (mobile app)
// ================================================================
router.get('/me', roleMiddleware([ROLES.PATIENT]), patientController.getMyPatientProfile);

// ================================================================
// SINGLE PATIENT
// ================================================================
router.get(
  '/:patient_id',
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  patientController.getPatient,
);

// ================================================================
// REGISTER NEW PATIENT
// ================================================================
router.post(
  '/',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(registerPatientSchema),
  patientController.registerPatient,
);

// ================================================================
// UPDATE PATIENT INFO
// ================================================================
router.patch(
  '/:patient_id',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN]),
  validate(updatePatientSchema),
  patientController.updatePatient,
);

// ================================================================
// TREATMENT OUTCOME
// ================================================================
router.patch(
  '/:patient_id/outcome',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  validate(updateTreatmentOutcomeSchema),
  patientController.updateTreatmentOutcome,
);

// ================================================================
// SPUTUM TEST SCHEDULE
// ================================================================
router.patch(
  '/:patient_id/sputum-schedule',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(updateSputumScheduleSchema),
  patientController.updateSputumSchedule,
);

// ================================================================
// DEACTIVATE / REACTIVATE
// ================================================================
router.patch(
  '/:patient_id/deactivate',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  patientController.deactivatePatient,
);

router.patch(
  '/:patient_id/reactivate',
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  patientController.reactivatePatient,
);

// ================================================================
// EXPORT
// ================================================================
router.get(
  '/export/pdf',
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  patientController.exportPatientsPdf,
);

export default router;