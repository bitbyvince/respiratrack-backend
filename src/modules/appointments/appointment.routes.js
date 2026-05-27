const express = require("express");
const router = express.Router();
const controller = require("./appointment.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  createAppointmentSchema,
  updateAppointmentSchema,
} = require("./appointment.validator");

router.post(
  "/",
  authenticate,
  authorize("patient", "nurse"),
  validate(createAppointmentSchema),
  controller.createAppointment,
);

router.get(
  "/",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getAppointments,
);

router.get(
  "/:appointmentId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin", "patient"),
  controller.getAppointment,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin", "patient"),
  controller.getPatientAppointments,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayAppointments,
);

router.patch(
  "/:appointmentId/confirm",
  authenticate,
  authorize("nurse", "barangay_admin"),
  controller.confirmAppointment,
);

router.patch(
  "/:appointmentId/complete",
  authenticate,
  authorize("nurse", "barangay_admin"),
  controller.completeAppointment,
);

router.patch(
  "/:appointmentId/cancel",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin", "patient"),
  controller.cancelAppointment,
);

router.patch(
  "/:appointmentId",
  authenticate,
  authorize("nurse", "barangay_admin"),
  validate(updateAppointmentSchema),
  controller.updateAppointment,
);

module.exports = router;
