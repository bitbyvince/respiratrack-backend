// Usage: router.get('/route', verifyToken, authorizeRoles('super_admin', 'barangay_admin'), handler)

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}. Your role: ${req.user.role}`,
      });
    }

    next();
  };
};

// Roles used in RespiraTrack:
// 'super_admin'     - full system access
// 'barangay_admin'  - manages one barangay
// 'nurse'           - records compliance, manages patients
// 'public_user'     - read-only access to public info
