import { Router } from "express";
import * as controller from "./appointment.controller.js";
import * as service from "./appointment.service.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./appointment.validator.js";

const router = Router();

// ── /my must be BEFORE /:appointmentId ───────────────────────
router.get("/my", authenticate, authorizeRoles("patient"), async (req, res) => {
  const { status, upcoming, page = 1, limit = 20 } = req.query;
  try {
    const appointments = await service.getPatientAppointments(
      req.user.patient_id,
      { status, upcoming, page, limit },
    );
    return sendSuccess(res, "Appointments retrieved.", { appointments });
  } catch (err) {
    return sendError(res, err);
  }
});

router.get(
  "/available-slots",
  authenticate,
  authorizeRoles("patient", "nurse", "barangay_admin", "super_admin"),
  controller.getAvailableSlots,
);

router.post(
  "/",
  authenticate,
  authorizeRoles("patient", "nurse"),
  validate(createAppointmentSchema),
  controller.createAppointment,
);

router.get(
  "/",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getAppointments,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin", "patient"),
  controller.getPatientAppointments,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayAppointments,
);

router.get(
  "/:appointmentId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin", "patient"),
  controller.getAppointment,
);

router.patch(
  "/:appointmentId/confirm",
  authenticate,
  authorizeRoles("nurse", "barangay_admin"),
  controller.confirmAppointment,
);

router.patch(
  "/:appointmentId/complete",
  authenticate,
  authorizeRoles("nurse", "barangay_admin"),
  controller.completeAppointment,
);

router.patch(
  "/:appointmentId/cancel",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin", "patient"),
  controller.cancelAppointment,
);

router.patch(
  "/:appointmentId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin"),
  validate(updateAppointmentSchema),
  controller.updateAppointment,
);

export default router;
