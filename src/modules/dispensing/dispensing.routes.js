import { Router } from "express";
import * as controller from "./dispensing.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorize,
  authorizeStaffOrPatc,
  authorizeStockDispensingOrPatc,
  enforceBarangayScope,
} from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createDispensingSchema,
  listDispensingSchema,
  dispensingIdParamsSchema,
} from "./dispensing.validator.js";

const router = Router();

router.get(
  "/patients/active",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  controller.getActivePatientsForDispensing
);

router.post(
  "/",
  authenticate,
  authorizeStockDispensingOrPatc,
  validate(createDispensingSchema),
  controller.createDispensingRecord
);

router.get(
  "/",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getDispensingRecords
);

router.get(
  "/my-supply",
  authenticate,
  authorize("patient"),
  controller.getMySupplyStatus
);

router.get(
  "/:recordId",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(dispensingIdParamsSchema, "params"),
  controller.getDispensingRecord
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getPatientDispensingRecords
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getBarangayDispensingRecords
);

export default router;