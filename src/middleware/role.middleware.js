// ============================================================
// role.middleware.js
// Authorization middleware — runs AFTER authenticate.
// Controls what each role can access and enforces
// barangay-level data isolation for barangay_admin and nurse.
//
// Roles in this system:
//   super_admin    — full municipal access, all barangays
//   barangay_admin — scoped to their own barangay only
//   nurse          — scoped to their own barangay only
//   patient        — scoped to their own records only
//
// Usage:
//   router.get("/route", authenticate, authorizeRoles("super_admin"), handler)
//   router.get("/route", authenticate, authorizeRoles("super_admin", "barangay_admin"), handler)
//   router.get("/route", authenticate, authorizeRoles("nurse", "barangay_admin"), handler)
// ============================================================

// ============================================================
// authorizeRoles(...roles)
// Basic role gate — blocks any role not in the allowed list.
// ============================================================
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "NOT_AUTHENTICATED",
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN_ROLE",
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
};

// ============================================================
// authorizeSuperAdmin
// Shorthand — only super_admin gets through.
// Used on: municipal stock, all-barangay reports,
//          user management, system-wide dashboards
// ============================================================
export const authorizeSuperAdmin = authorizeRoles("super_admin");

// ============================================================
// authorizeAdmin
// super_admin OR barangay_admin.
// Used on: barangay patient lists, compliance exports,
//          appointment confirmation, stock allocation views
// ============================================================
export const authorizeAdmin = authorizeRoles("super_admin", "barangay_admin");

// ============================================================
// authorizeStaff
// super_admin, barangay_admin, OR nurse.
// Used on: patient records, dispensing, alerts, inventory
// ============================================================
export const authorizeStaff = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
);

// ============================================================
// authorizePatientSelf
// Patients can only access their own records.
// Checks that the patient_id in the route param matches
// the logged-in patient's own patient_id from the JWT.
//
// Usage:
//   router.get(
//     "/patients/:patient_id/medication-logs",
//     authenticate,
//     authorizePatientSelf,
//     handler
//   )
// ============================================================
export const authorizePatientSelf = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: "NOT_AUTHENTICATED",
      message: "Authentication required.",
    });
  }

  // Super admin, patc, barangay admin, and nurse can always view patient records
  if (["super_admin", "patc", "barangay_admin", "nurse"].includes(req.user.role)) {
    return next();
  }

  // For patients — enforce self-access only
  if (req.user.role === "patient") {
    const requestedPatientId = req.params.patient_id;

    if (!requestedPatientId) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PATIENT_ID",
        message: "Patient ID is required in the route.",
      });
    }

    if (req.user.patient_id !== requestedPatientId) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN_PATIENT",
        message: "Access denied. You can only access your own records.",
      });
    }

    return next();
  }

  return res.status(403).json({
    success: false,
    code: "FORBIDDEN",
    message: "Access denied.",
  });
};

// ============================================================
// enforceBarangayScope
// Enforces barangay-level data isolation.
// Barangay admin and nurse can only access data from
// their own assigned barangay.
// Super admin bypasses this check entirely.
//
// Works two ways:
//   A. Route param  — checks req.params.barangay_id
//   B. Query param  — checks req.query.barangay_id
//   C. Request body — checks req.body.barangay_id
//
// Usage:
//   router.get(
//     "/barangays/:barangay_id/patients",
//     authenticate,
//     authorizeStaff,
//     enforceBarangayScope,
//     handler
//   )
// ============================================================
export const enforceBarangayScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: "NOT_AUTHENTICATED",
      message: "Authentication required.",
    });
  }

  // Super admin and patc have unrestricted municipal access
  if (req.user.role === "super_admin" || req.user.role === "patc") {
    return next();
  }

  // Patients are handled by authorizePatientSelf, not this middleware
  if (req.user.role === "patient") {
    return next();
  }

  // For barangay_admin and nurse — enforce their assigned barangay
  const requestedBarangayId =
    req.params.barangay_id || req.query.barangay_id || req.body?.barangay_id;

  if (!requestedBarangayId) {
    // No barangay_id in the request — inject the user's own barangay_id
    // so downstream handlers automatically filter to their scope
    req.scopedBarangayId = req.user.barangay_id;
    return next();
  }

  if (req.user.barangay_id !== requestedBarangayId) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN_BARANGAY",
      message:
        "Access denied. You can only access data from your assigned barangay.",
    });
  }

  req.scopedBarangayId = req.user.barangay_id;
  next();
};

// ============================================================
// authorizeEscalationAck
// Add 2 — Escalation Workflow
// Controls who can acknowledge each escalation level.
//
//   Level 1 acknowledgement — assigned nurse only
//   Level 2 acknowledgement — barangay_admin or super_admin
//   Level 3 acknowledgement — super_admin only
//
// Expects req.escalationLevel to be set by the route handler
// before this middleware runs, OR reads from req.body.level.
//
// Usage:
//   router.patch(
//     "/escalations/:escalation_id/acknowledge",
//     authenticate,
//     authorizeStaff,
//     authorizeEscalationAck,
//     handler
//   )
// ============================================================
export const authorizeEscalationAck = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: "NOT_AUTHENTICATED",
      message: "Authentication required.",
    });
  }

  const level = req.escalationLevel ?? req.body?.level ?? null;

  if (level === null || level === undefined) {
    return res.status(400).json({
      success: false,
      code: "MISSING_ESCALATION_LEVEL",
      message: "Escalation level is required.",
    });
  }

  const { role } = req.user;

  const ackPermissions = {
    1: ["nurse", "barangay_admin", "super_admin"],
    2: ["barangay_admin", "super_admin"],
    3: ["super_admin"],
  };

  const allowedRoles = ackPermissions[level];

  if (!allowedRoles) {
    return res.status(400).json({
      success: false,
      code: "INVALID_ESCALATION_LEVEL",
      message: `Invalid escalation level: ${level}. Must be 1, 2, or 3.`,
    });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN_ESCALATION_ACK",
      message: `Access denied. Level ${level} escalations can only be acknowledged by: ${allowedRoles.join(", ")}.`,
    });
  }

  next();
};

// ============================================================
// authorizePatientRegistration
// Only nurses (tablet) and barangay_admin (web) can register
// new patients. Patients and public users cannot self-register.
// ============================================================
export const authorizePatientRegistration = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
);

// ============================================================
// authorizeStockManagement
// Stock allocation — super_admin only (allocates to barangays)
// Stock dispensing — nurse and barangay_admin (dispense to patients)
// ============================================================
export const authorizeStockAllocation = authorizeRoles("super_admin");

export const authorizeStockDispensing = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
);

// ============================================================
// authorizeReportExport
// Controls who can export which reports to PDF.
// All staff roles can export — patients cannot.
// ============================================================
export const authorizeReportExport = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
);

// ============================================================
// authorizeSputumResultEntry
// Only health providers (barangay_admin and above) can enter
// sputum test results. Nurses can view but not enter results.
// ============================================================
export const authorizeSputumResultEntry = authorizeRoles(
  "super_admin",
  "barangay_admin",
);

// ============================================================
// COMBINED MIDDLEWARE CHAINS
// Pre-composed chains for common route patterns.
// Import and use directly on routes to keep route files clean.
//
// Usage:
//   import { staffInBarangay } from "../middleware/role.middleware.js"
//   router.get("/patients", authenticate, ...staffInBarangay, handler)
// ============================================================

// Staff scoped to their own barangay
export const staffInBarangay = [authorizeStaff, enforceBarangayScope];

// Admin scoped to their own barangay (for admin-only actions)
export const adminInBarangay = [authorizeAdmin, enforceBarangayScope];

// Patient accessing their own data
export const patientSelfAccess = [authorizePatientSelf];

// Nurse or admin doing a barangay-scoped action
export const nurseOrAdminInBarangay = [
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  enforceBarangayScope,
];
export const authorize = authorizeRoles;
export const roleMiddleware = authorizeRoles;

// ============================================================
// patc role
// patc gets the same access as super_admin everywhere EXCEPT
// account creation (creating barangay_admin/nurse/patient
// accounts) — those routes must keep using authorizeSuperAdmin
// / authorizeAdmin directly, never the OrPatc variants below.
// ============================================================
export const authorizeSuperAdminOrPatc = authorizeRoles("super_admin", "patc");
export const authorizeAdminOrPatc = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "patc",
);
export const authorizeStaffOrPatc = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
  "patc",
);
export const authorizeStockDispensingOrPatc = authorizeRoles(
  "super_admin",
  "barangay_admin",
  "nurse",
  "patc",
);
