import { Router } from 'express';
import * as patientController from './patient.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorizeStaff, authorizeAdmin, authorizeRoles } from '../../middleware/role.middleware.js';
import {
  registerPatientSchema,
  updatePatientSchema,
  updateTreatmentOutcomeSchema,
  updateSputumScheduleSchema,
  listPatientsSchema,
} from './patient.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', authorizeStaff, validate(listPatientsSchema, 'query'), patientController.listPatients);
router.get('/me', authorizeRoles('patient'), patientController.getMyPatientProfile);
router.get('/export/pdf', authorizeStaff, patientController.exportPatientsPdf);
router.get('/:patient_id', authorizeStaff, patientController.getPatient);
router.post('/', authorizeAdmin, validate(registerPatientSchema), patientController.registerPatient);
router.patch('/:patient_id', authorizeStaff, validate(updatePatientSchema), patientController.updatePatient);
router.patch('/:patient_id/outcome', authorizeAdmin, validate(updateTreatmentOutcomeSchema), patientController.updateTreatmentOutcome);
router.patch('/:patient_id/sputum-schedule', authorizeAdmin, validate(updateSputumScheduleSchema), patientController.updateSputumSchedule);
router.patch('/:patient_id/deactivate', authorizeAdmin, patientController.deactivatePatient);
router.patch('/:patient_id/reactivate', authorizeAdmin, patientController.reactivatePatient);

export default router;