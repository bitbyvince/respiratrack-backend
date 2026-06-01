import express from "express";
import * as controller from "./sputum-test.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createSputumTestSchema, enterResultSchema, updateSputumTestSchema, listSputumTestsSchema, getUpcomingSchema } from "./sputum-test.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();
const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ALL_ROLES = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATIENT];

router.post("/", authenticate, authorizeRoles(...ALL_STAFF), validate(createSputumTestSchema), controller.createSputumTest);

router.get("/", authenticate, authorizeRoles(...ALL_STAFF), validate(listSputumTestsSchema, "query"), controller.listSputumTests);

router.get("/my", authenticate, authorizeRoles(ROLES.PATIENT), controller.getMyTests);

router.get("/upcoming", authenticate, authorizeRoles(...ALL_STAFF), validate(getUpcomingSchema, "query"), controller.getUpcomingTests);

router.get("/overdue", authenticate, authorizeRoles(...ALL_STAFF), controller.getOverdueTests);

router.get("/patient/:patientId/summary", authenticate, authorizeRoles(...ALL_ROLES), controller.getPatientSputumSummary);

router.get("/:testId", authenticate, authorizeRoles(...ALL_ROLES), controller.getSputumTest);

router.patch("/:testId/result", authenticate, authorizeRoles(...ALL_STAFF), validate(enterResultSchema), controller.enterResult);

router.patch("/:testId", authenticate, authorizeRoles(...ALL_STAFF), validate(updateSputumTestSchema), controller.updateSputumTest);

export default router;