import express from "express";
import * as controller from "./symptom-log.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { logSymptomSchema, reviewSymptomSchema } from "./symptom-log.validator.js";

const router = express.Router();

router.post("/", authenticate, authorizeRoles("patient", "nurse"), validate(logSymptomSchema), controller.logSymptom);

router.get("/history", authenticate, authorizeRoles("patient"), controller.getMyLogs);

router.get("/patient/:patientId", authenticate, authorizeRoles("nurse", "barangay_admin", "super_admin"), controller.getPatientLogs);

router.get("/patient/:patientId/latest", authenticate, authorizeRoles("nurse", "barangay_admin", "super_admin"), controller.getLatestLog);

router.get("/barangay/:barangayId", authenticate, authorizeRoles("nurse", "barangay_admin", "super_admin"), controller.getBarangayLogs);

router.patch("/:logId/review", authenticate, authorizeRoles("nurse", "barangay_admin", "super_admin"), validate(reviewSymptomSchema), controller.reviewLog);

export default router;