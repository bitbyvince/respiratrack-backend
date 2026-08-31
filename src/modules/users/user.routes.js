import express from "express";
import * as userController from "./user.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import ROLES from "../../constants/roles.js";
import {
  createStaffSchema,
  updateStaffSchema,
  createPatientAccountSchema,
  updatePatientAccountSchema,
  listUsersSchema,
} from "./user.validator.js";

const router = express.Router();

router.use(authenticate);

router.patch(
  '/patients/:patient_id/reset-pin',
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  userController.resetPatientPin,
);

router.get(
  "/staff",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  validate(listUsersSchema, "query"),
  userController.listStaff,
);
router.get(
  "/staff/:user_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  userController.getStaff,
);
router.post(
  "/staff",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  validate(createStaffSchema),
  userController.createStaff,
);
router.patch(
  "/staff/:user_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  validate(updateStaffSchema),
  userController.updateStaff,
);
router.patch(
  "/staff/:user_id/deactivate",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  userController.deactivateStaff,
);
router.patch(
  "/staff/:user_id/reactivate",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  userController.reactivateStaff,
);
router.delete(
  "/staff/:user_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.PATC),
  userController.deleteStaff,
);

router.get(
  "/patients",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  validate(listUsersSchema, "query"),
  userController.listPatientAccounts,
);
router.get(
  "/patients/:user_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC),
  userController.getPatientAccount,
);
// Patient account creation stays off super_admin/patc — mirrors super_admin's
// existing scope (only barangay_admin/nurse create patient accounts).
router.post(
  "/patients",
  authorizeRoles(ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  validate(createPatientAccountSchema),
  userController.createPatientAccount,
);
router.patch(
  "/patients/:user_id",
  authorizeRoles(ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN, ROLES.PATC),
  validate(updatePatientAccountSchema),
  userController.updatePatientAccount,
);
router.patch(
  "/patients/:user_id/deactivate",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  userController.deactivatePatientAccount,
);
router.patch(
  "/patients/:user_id/reactivate",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  userController.reactivatePatientAccount,
);

router.get("/me/profile", userController.getMyProfile);
router.patch(
  "/me/profile",
  validate(updateStaffSchema),
  userController.updateMyProfile,
);

export default router;