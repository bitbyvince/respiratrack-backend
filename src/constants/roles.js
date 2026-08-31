const ROLES = {
  SUPER_ADMIN: "super_admin",
  BARANGAY_ADMIN: "barangay_admin",
  PATC: "patc",
  NURSE: "nurse",
  PATIENT: "patient",
  PUBLIC_USER: "public_user",
  STAFF_ROLES: ["super_admin", "barangay_admin", "nurse", "patc"],
  MANAGEMENT_ROLES: ["super_admin", "barangay_admin", "patc"],
  // Roles with unrestricted, municipal-wide (all-barangay) access.
  // patc mirrors super_admin everywhere except account creation —
  // use this wherever code branches on "am I super_admin (i.e.
  // not barangay-scoped)?" instead of comparing to "super_admin" directly.
  SUPER_ADMIN_LEVEL: ["super_admin", "patc"],
};

// True for roles that get unrestricted, all-barangay access (super_admin, patc).
export const isSuperAdminLevel = (role) => ROLES.SUPER_ADMIN_LEVEL.includes(role);

// replace: module.exports = ROLES;
export { ROLES };
export default ROLES;
