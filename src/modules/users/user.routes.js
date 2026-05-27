const express = require("express");
const router = express.Router();
const userController = require("./user.controller");
const { validate } = require("../../middleware/validate.middleware");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { roleMiddleware } = require("../../middleware/role.middleware");
const ROLES = require("../../constants/roles");
const {
  createStaffSchema,
  updateStaffSchema,
  createPatientAccountSchema,
  updatePatientAccountSchema,
  listUsersSchema,
} = require("./user.validator");

// ── All routes require authentication ────────────────────
router.use(authMiddleware);

// ================================================================
// STAFF ACCOUNT MANAGEMENT
// Only super_admin can create/manage barangay_admin & nurse accounts
// barangay_admin can create/manage nurse accounts within their brgy
// ================================================================

// GET /api/users/staff
// super_admin → all staff | barangay_admin → staff in their barangay
router.get(
  "/staff",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  validate(listUsersSchema, "query"),
  userController.listStaff,
);

// GET /api/users/staff/:user_id
router.get(
  "/staff/:user_id",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  userController.getStaff,
);

// POST /api/users/staff
// Creates a barangay_admin or nurse account
router.post(
  "/staff",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  validate(createStaffSchema),
  userController.createStaff,
);

// PATCH /api/users/staff/:user_id
router.patch(
  "/staff/:user_id",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  validate(updateStaffSchema),
  userController.updateStaff,
);

// PATCH /api/users/staff/:user_id/deactivate
router.patch(
  "/staff/:user_id/deactivate",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  userController.deactivateStaff,
);

// PATCH /api/users/staff/:user_id/reactivate
router.patch(
  "/staff/:user_id/reactivate",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  userController.reactivateStaff,
);

// DELETE /api/users/staff/:user_id
// Hard delete — super_admin only
router.delete(
  "/staff/:user_id",
  roleMiddleware([ROLES.SUPER_ADMIN]),
  userController.deleteStaff,
);

// ================================================================
// PATIENT MOBILE ACCOUNT MANAGEMENT
// Nurse or barangay_admin creates the mobile account when
// registering a patient so they can log in to the mobile app
// ================================================================

// GET /api/users/patients
// super_admin → all | barangay_admin & nurse → their barangay only
router.get(
  "/patients",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(listUsersSchema, "query"),
  userController.listPatientAccounts,
);

// GET /api/users/patients/:user_id
router.get(
  "/patients/:user_id",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  userController.getPatientAccount,
);

// POST /api/users/patients
// Creates the mobile login credentials for a registered patient
router.post(
  "/patients",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(createPatientAccountSchema),
  userController.createPatientAccount,
);

// PATCH /api/users/patients/:user_id
// Update phone, email, or reset PIN
router.patch(
  "/patients/:user_id",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN]),
  validate(updatePatientAccountSchema),
  userController.updatePatientAccount,
);

// PATCH /api/users/patients/:user_id/deactivate
router.patch(
  "/patients/:user_id/deactivate",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  userController.deactivatePatientAccount,
);

// PATCH /api/users/patients/:user_id/reactivate
router.patch(
  "/patients/:user_id/reactivate",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  userController.reactivatePatientAccount,
);

// ================================================================
// SELF-SERVICE (any authenticated user)
// ================================================================

// GET /api/users/me/profile
router.get("/me/profile", userController.getMyProfile);

// PATCH /api/users/me/profile
// Staff: update own name, email, phone
// Patient: update own email, phone
router.patch(
  "/me/profile",
  validate(updateStaffSchema),
  userController.updateMyProfile,
);

module.exports = router;
