const express = require("express");
const router = express.Router();
const controller = require("./barangay.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const {
  authorizeStaff,
  authorizeSuperAdmin,
  enforceBarangayScope,
} = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  createBarangaySchema,
  updateBarangaySchema,
} = require("./barangay.validator");

router.post(
  "/",
  authenticate,
  authorizeSuperAdmin,
  validate(createBarangaySchema),
  controller.createBarangay,
);

router.get(
  "/",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  controller.getBarangays,
);

router.get(
  "/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  controller.getBarangay,
);

router.patch(
  "/:barangayId",
  authenticate,
  authorizeSuperAdmin,
  validate(updateBarangaySchema),
  controller.updateBarangay,
);

module.exports = router;
