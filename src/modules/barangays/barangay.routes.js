import { Router } from "express";
import * as controller from "./barangay.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorizeStaff,
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
  authorizeStaff,
  enforceBarangayScope,
  controller.getBarangays
);

router.get(
  "/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  controller.getBarangay
);

router.patch(
  "/:barangayId",
  authenticate,
  authorizeSuperAdmin,
  validate(updateBarangaySchema),
  controller.updateBarangay
);

export default router;