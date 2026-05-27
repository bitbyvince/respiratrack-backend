import { Router } from "express";
import * as controller from "./dispensing.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorizeStaff,
  authorizeStockDispensing,
  enforceBarangayScope,
} from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createDispensingSchema,
  listDispensingSchema,
  dispensingIdParamsSchema,
} from "./dispensing.validator.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorizeStockDispensing,
  validate(createDispensingSchema),
  controller.createDispensingRecord
);

router.get(
  "/",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getDispensingRecords
);

router.get(
  "/:recordId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(dispensingIdParamsSchema, "params"),
  controller.getDispensingRecord
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getPatientDispensingRecords
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getBarangayDispensingRecords
);

export default router;