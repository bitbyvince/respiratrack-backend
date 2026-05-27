import express from "express";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";

import SuperAdmin from "../models/SuperAdmin.js";
import Barangay from "../models/Barangay.js";
import BarangayAdmin from "../models/BarangayAdmin.js";
import Nurse from "../models/Nurse.js";
import PublicUser from "../models/PublicUser.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// All user routes require authentication
router.use(verifyToken);

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res
      .status(400)
      .json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
};

// =============================================================================
// PROFILE — Any logged-in user can get and update their own profile
// =============================================================================

/**
 * GET /api/users/me
 * Returns the profile of the currently logged-in user based on their role.
 */
router.get("/me", async (req, res) => {
  try {
    const { id, role } = req.user;

    let user;
    switch (role) {
      case "super_admin":
        user = await SuperAdmin.findById(id).select("-password_hash");
        break;
      case "barangay_admin":
        user = await BarangayAdmin.findById(id)
          .select("-password_hash")
          .populate("barangay_id", "name municipality province");
        break;
      case "nurse":
        user = await Nurse.findById(id)
          .select("-password_hash")
          .populate("barangay_id", "name municipality province");
        break;
      case "public_user":
        user = await PublicUser.findById(id).select("-password_hash");
        break;
      default:
        return res.status(400).json({ message: "Unknown role." });
    }

    if (!user) return res.status(404).json({ message: "User not found." });

    res.json({ user: { ...user.toObject(), role } });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error fetching profile." });
  }
});

/**
 * PATCH /api/users/me
 * Update own profile — name, email, license number (nurse), location (public user).
 * Password change requires current password confirmation.
 */
router.patch(
  "/me",
  [
    body("full_name").optional().trim().isLength({ min: 2 }),
    body("email").optional().isEmail().withMessage("Invalid email format"),
    body("new_password")
      .optional()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("current_password")
      .if(body("new_password").exists())
      .notEmpty()
      .withMessage("Current password is required to set a new password"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const { id, role } = req.user;
      const {
        full_name,
        email,
        new_password,
        current_password,
        license_number,
      } = req.body;

      let Model;
      switch (role) {
        case "super_admin":
          Model = SuperAdmin;
          break;
        case "barangay_admin":
          Model = BarangayAdmin;
          break;
        case "nurse":
          Model = Nurse;
          break;
        case "public_user":
          Model = PublicUser;
          break;
        default:
          return res.status(400).json({ message: "Unknown role." });
      }

      const user = await Model.findById(id);
      if (!user) return res.status(404).json({ message: "User not found." });

      // If changing password, verify current password first
      if (new_password) {
        const isMatch = await bcrypt.compare(
          current_password,
          user.password_hash,
        );
        if (!isMatch) {
          return res
            .status(401)
            .json({ message: "Current password is incorrect." });
        }
        user.password_hash = await bcrypt.hash(new_password, 12);
      }

      if (full_name) user.full_name = full_name;
      if (email) user.email = email;
      if (license_number && role === "nurse")
        user.license_number = license_number;

      await user.save();

      const updated = user.toObject();
      delete updated.password_hash;

      res.json({ message: "Profile updated successfully.", user: updated });
    } catch (err) {
      console.error("Update profile error:", err);
      res.status(500).json({ message: "Server error updating profile." });
    }
  },
);

/**
 * PATCH /api/users/me/location
 * Public user updates their last known location (used for heatmap geofence matching).
 * Body: { longitude, latitude }
 */
router.patch(
  "/me/location",
  authorizeRoles("public_user"),
  [
    body("longitude")
      .isFloat({ min: -180, max: 180 })
      .withMessage("Longitude must be between -180 and 180"),
    body("latitude")
      .isFloat({ min: -90, max: 90 })
      .withMessage("Latitude must be between -90 and 90"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { longitude, latitude } = req.body;

    try {
      const user = await PublicUser.findByIdAndUpdate(
        req.user.id,
        {
          last_location: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
        },
        { new: true },
      ).select("-password_hash");

      res.json({
        message: "Location updated.",
        last_location: user.last_location,
      });
    } catch (err) {
      console.error("Update location error:", err);
      res.status(500).json({ message: "Server error updating location." });
    }
  },
);

// =============================================================================
// BARANGAYS — Super admin manages barangays
// =============================================================================

/**
 * GET /api/users/barangays
 * All staff can view the list of barangays (needed for dropdowns).
 */
router.get(
  "/barangays",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const barangays = await Barangay.find().sort({ name: 1 });
      res.json({ count: barangays.length, barangays });
    } catch (err) {
      console.error("Get barangays error:", err);
      res.status(500).json({ message: "Server error fetching barangays." });
    }
  },
);

/**
 * POST /api/users/barangays
 * Super admin creates a new barangay.
 */
router.post(
  "/barangays",
  authorizeRoles("super_admin"),
  [
    body("name").trim().notEmpty().withMessage("Barangay name is required"),
    body("municipality")
      .trim()
      .notEmpty()
      .withMessage("Municipality is required"),
    body("province").trim().notEmpty().withMessage("Province is required"),
    body("longitude")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Invalid longitude"),
    body("latitude")
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage("Invalid latitude"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { name, municipality, province, longitude, latitude } = req.body;

    try {
      const barangayData = {
        name,
        municipality,
        province,
        created_at: new Date(),
      };

      if (longitude && latitude) {
        barangayData.location = {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        };
      }

      const barangay = await Barangay.create(barangayData);
      res
        .status(201)
        .json({ message: "Barangay created successfully.", barangay });
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(409)
          .json({
            message:
              "A barangay with this name already exists in this municipality.",
          });
      }
      console.error("Create barangay error:", err);
      res.status(500).json({ message: "Server error creating barangay." });
    }
  },
);

/**
 * PUT /api/users/barangays/:id
 * Super admin updates barangay details.
 */
router.put(
  "/barangays/:id",
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const { name, municipality, province, longitude, latitude } = req.body;

      const updates = {};
      if (name) updates.name = name;
      if (municipality) updates.municipality = municipality;
      if (province) updates.province = province;
      if (longitude && latitude) {
        updates.location = {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        };
      }

      const barangay = await Barangay.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true },
      );

      if (!barangay)
        return res.status(404).json({ message: "Barangay not found." });

      res.json({ message: "Barangay updated successfully.", barangay });
    } catch (err) {
      console.error("Update barangay error:", err);
      res.status(500).json({ message: "Server error updating barangay." });
    }
  },
);

// =============================================================================
// BARANGAY ADMINS — Super admin manages barangay admins
// =============================================================================

/**
 * GET /api/users/barangay-admins
 * Super admin: get all barangay admins
 * Barangay admin: get only their own record
 */
router.get(
  "/barangay-admins",
  authorizeRoles("super_admin", "barangay_admin"),
  async (req, res) => {
    try {
      const { role, barangay_id, id } = req.user;

      let filter = {};
      if (role === "barangay_admin") filter._id = id;

      const admins = await BarangayAdmin.find(filter)
        .select("-password_hash")
        .populate("barangay_id", "name municipality")
        .sort({ created_at: -1 });

      res.json({ count: admins.length, admins });
    } catch (err) {
      console.error("Get barangay admins error:", err);
      res
        .status(500)
        .json({ message: "Server error fetching barangay admins." });
    }
  },
);

/**
 * POST /api/users/barangay-admins
 * Super admin creates a barangay admin account.
 */
router.post(
  "/barangay-admins",
  authorizeRoles("super_admin"),
  [
    body("barangay_id").notEmpty().withMessage("Barangay ID is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name").trim().notEmpty().withMessage("Full name is required"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { barangay_id, email, password, full_name } = req.body;

    try {
      const existing = await BarangayAdmin.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: "Email already registered." });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const admin = await BarangayAdmin.create({
        barangay_id,
        email,
        password_hash,
        full_name,
        created_at: new Date(),
      });

      const result = admin.toObject();
      delete result.password_hash;

      res
        .status(201)
        .json({
          message: "Barangay admin created successfully.",
          admin: result,
        });
    } catch (err) {
      console.error("Create barangay admin error:", err);
      res
        .status(500)
        .json({ message: "Server error creating barangay admin." });
    }
  },
);

/**
 * DELETE /api/users/barangay-admins/:id
 * Super admin removes a barangay admin.
 */
router.delete(
  "/barangay-admins/:id",
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const admin = await BarangayAdmin.findByIdAndDelete(req.params.id);
      if (!admin)
        return res.status(404).json({ message: "Barangay admin not found." });

      res.json({
        message: `Barangay admin ${admin.full_name} deleted successfully.`,
      });
    } catch (err) {
      console.error("Delete barangay admin error:", err);
      res
        .status(500)
        .json({ message: "Server error deleting barangay admin." });
    }
  },
);

// =============================================================================
// NURSES — Barangay admin and super admin manage nurses
// =============================================================================

/**
 * GET /api/users/nurses
 * Super admin: all nurses system-wide
 * Barangay admin: nurses in their barangay only
 */
router.get(
  "/nurses",
  authorizeRoles("super_admin", "barangay_admin"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let filter = {};
      if (role === "barangay_admin") filter.barangay_id = barangay_id;

      const nurses = await Nurse.find(filter)
        .select("-password_hash")
        .populate("barangay_id", "name municipality")
        .sort({ created_at: -1 });

      res.json({ count: nurses.length, nurses });
    } catch (err) {
      console.error("Get nurses error:", err);
      res.status(500).json({ message: "Server error fetching nurses." });
    }
  },
);

/**
 * POST /api/users/nurses
 * Super admin or barangay admin creates a nurse account.
 * Barangay admin can only create nurses for their own barangay.
 */
router.post(
  "/nurses",
  authorizeRoles("super_admin", "barangay_admin"),
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name").trim().notEmpty().withMessage("Full name is required"),
    body("barangay_id")
      .if((value, { req }) => req.user?.role === "super_admin")
      .notEmpty()
      .withMessage("Barangay ID is required"),
    body("license_number").optional().trim(),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { email, password, full_name, license_number } = req.body;
    const { role, barangay_id: adminBarangayId } = req.user;

    // Barangay admin can only create nurses for their own barangay
    const barangay_id =
      role === "super_admin" ? req.body.barangay_id : adminBarangayId;

    try {
      const existing = await Nurse.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: "Email already registered." });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const nurse = await Nurse.create({
        barangay_id,
        email,
        password_hash,
        full_name,
        license_number: license_number || null,
        created_at: new Date(),
      });

      const result = nurse.toObject();
      delete result.password_hash;

      res
        .status(201)
        .json({
          message: "Nurse account created successfully.",
          nurse: result,
        });
    } catch (err) {
      console.error("Create nurse error:", err);
      res.status(500).json({ message: "Server error creating nurse." });
    }
  },
);

/**
 * PUT /api/users/nurses/:id
 * Update a nurse's details.
 */
router.put(
  "/nurses/:id",
  authorizeRoles("super_admin", "barangay_admin"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;
      const { full_name, email, license_number } = req.body;

      let filter = { _id: req.params.id };
      if (role === "barangay_admin") filter.barangay_id = barangay_id;

      const updates = {};
      if (full_name) updates.full_name = full_name;
      if (email) updates.email = email;
      if (license_number !== undefined) updates.license_number = license_number;

      const nurse = await Nurse.findOneAndUpdate(
        filter,
        { $set: updates },
        { new: true },
      )
        .select("-password_hash")
        .populate("barangay_id", "name municipality");

      if (!nurse) return res.status(404).json({ message: "Nurse not found." });

      res.json({ message: "Nurse updated successfully.", nurse });
    } catch (err) {
      console.error("Update nurse error:", err);
      res.status(500).json({ message: "Server error updating nurse." });
    }
  },
);

/**
 * DELETE /api/users/nurses/:id
 * Super admin or barangay admin removes a nurse.
 */
router.delete(
  "/nurses/:id",
  authorizeRoles("super_admin", "barangay_admin"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let filter = { _id: req.params.id };
      if (role === "barangay_admin") filter.barangay_id = barangay_id;

      const nurse = await Nurse.findOneAndDelete(filter);
      if (!nurse) return res.status(404).json({ message: "Nurse not found." });

      res.json({ message: `Nurse ${nurse.full_name} deleted successfully.` });
    } catch (err) {
      console.error("Delete nurse error:", err);
      res.status(500).json({ message: "Server error deleting nurse." });
    }
  },
);

// =============================================================================
// PUBLIC USERS — Super admin can view and manage public users
// =============================================================================

/**
 * GET /api/users/public
 * Super admin views all public users.
 */
router.get("/public", authorizeRoles("super_admin"), async (req, res) => {
  try {
    const users = await PublicUser.find()
      .select("-password_hash")
      .sort({ created_at: -1 });

    res.json({ count: users.length, users });
  } catch (err) {
    console.error("Get public users error:", err);
    res.status(500).json({ message: "Server error fetching public users." });
  }
});

/**
 * DELETE /api/users/public/:id
 * Super admin removes a public user account.
 */
router.delete(
  "/public/:id",
  authorizeRoles("super_admin"),
  async (req, res) => {
    try {
      const user = await PublicUser.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found." });

      res.json({
        message: `Public user ${user.contact_number} deleted successfully.`,
      });
    } catch (err) {
      console.error("Delete public user error:", err);
      res.status(500).json({ message: "Server error deleting public user." });
    }
  },
);

export default router;
