import { Router } from "express";
import controller from "./report.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  getPatientReportSchema,
  getBarangayReportSchema,
  getCityReportSchema,
  getComplianceTrendSchema,
  getInventoryReportSchema,
  getTreatmentOutcomeSchema,
} from "./report.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC];
const SUPER_ADMIN_ONLY = [ROLES.SUPER_ADMIN, ROLES.PATC];

router.get(
  "/patient",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getPatientReportSchema, "query"),
  controller.getPatientReport
);

router.get(
  "/barangay",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(getBarangayReportSchema, "query"),
  controller.getBarangayReport
);

router.get(
  "/city",
  authenticate,
  authorizeRoles(...SUPER_ADMIN_ONLY),
  validate(getCityReportSchema, "query"),
  controller.getCityReport
);

router.get(
  "/compliance-trend",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getComplianceTrendSchema, "query"),
  controller.getComplianceTrend
);

router.get(
  "/inventory",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getInventoryReportSchema, "query"),
  controller.getInventoryReport
);

router.get(
  "/treatment-outcomes",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(getTreatmentOutcomeSchema, "query"),
  controller.getTreatmentOutcomes
);

export default router;