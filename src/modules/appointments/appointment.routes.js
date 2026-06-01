import { Router } from 'express';
import * as controller from './appointment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createAppointmentSchema, updateAppointmentSchema } from './appointment.validator.js';

const router = Router();

router.post('/', authenticate, authorize('patient', 'nurse'), validate(createAppointmentSchema), controller.createAppointment);

router.get('/', authenticate, authorize('nurse', 'barangay_admin', 'super_admin'), controller.getAppointments);

router.get('/my', authenticate, authorize('patient'), controller.getMyAppointments);

router.get('/patient/:patientId', authenticate, authorize('nurse', 'barangay_admin', 'super_admin', 'patient'), controller.getPatientAppointments);

router.get('/barangay/:barangayId', authenticate, authorize('nurse', 'barangay_admin', 'super_admin'), controller.getBarangayAppointments);

router.get('/available-slots', authenticate, authorize('patient', 'nurse'), controller.getAvailableSlots);

router.get('/:appointmentId', authenticate, authorize('nurse', 'barangay_admin', 'super_admin', 'patient'), controller.getAppointment);

router.patch('/:appointmentId/confirm', authenticate, authorize('nurse', 'barangay_admin'), controller.confirmAppointment);

router.patch('/:appointmentId/complete', authenticate, authorize('nurse', 'barangay_admin'), controller.completeAppointment);

router.patch('/:appointmentId/cancel', authenticate, authorize('nurse', 'barangay_admin', 'super_admin', 'patient'), controller.cancelAppointment);

router.patch('/:appointmentId', authenticate, authorize('nurse', 'barangay_admin'), validate(updateAppointmentSchema), controller.updateAppointment);

export default router;