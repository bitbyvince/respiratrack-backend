const ROLES = {
  SUPER_ADMIN: "super_admin",
  BARANGAY_ADMIN: "barangay_admin",
  NURSE: "nurse",
  PATIENT: "patient",
  PUBLIC_USER: "public_user",
  STAFF_ROLES: ["super_admin", "barangay_admin", "nurse"],
  MANAGEMENT_ROLES: ["super_admin", "barangay_admin"],
};

module.exports = ROLES;
