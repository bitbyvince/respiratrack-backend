import { Router } from "express";
import * as controller from "./barangay.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorizeStaffOrPatc,
  authorizeSuperAdminOrPatc,
  authorizeSuperAdmin,   
  enforceBarangayScope,
} from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createBarangaySchema,
  updateBarangaySchema,
} from "./barangay.validator.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorizeSuperAdmin,
  validate(createBarangaySchema),
  controller.createBarangay
);

router.get(
  "/",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  controller.getBarangays
);

router.get(
  "/:barangayId",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  controller.getBarangay
);

router.patch(
  "/:barangayId",
  authenticate,
  authorizeSuperAdminOrPatc,
  validate(updateBarangaySchema),
  controller.updateBarangay
);

export default router;