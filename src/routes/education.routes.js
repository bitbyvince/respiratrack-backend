import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// ─── Inline Model ─────────────────────────────────────────────────────────────

const EducationContent =
  mongoose.models.EducationContent ||
  mongoose.model(
    "EducationContent",
    new mongoose.Schema(
      {
        title: {
          type: String,
          required: true,
        },
        content_body: {
          type: String,
          required: true,
        },
        category: {
          type: String,
          enum: [
            "Protection Protocol",
            "TB Awareness",
            "Treatment Guide",
            "Emergency Response",
          ],
          required: true,
        },
        risk_level_target: {
          type: String,
          enum: ["Low", "Moderate", "High", "Critical", null],
          default: null,
        },
        is_active: {
          type: Boolean,
          default: true,
        },
        created_at: {
          type: Date,
          default: Date.now,
        },
      },
      { collection: "education_contents" },
    ),
  );

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/education
 * Get all active education content
 * Query params: category, risk_level_target, is_active, limit, page, search
 */
router.get("/", async (req, res) => {
  try {
    const {
      category,
      risk_level_target,
      is_active,
      limit = 20,
      page = 1,
      search,
    } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (risk_level_target) filter.risk_level_target = risk_level_target;

    // Default to only active content unless explicitly requesting all
    if (is_active !== undefined) {
      filter.is_active = is_active === "true";
    } else {
      filter.is_active = true;
    }

    // Text search on title and content_body (requires text index in MongoDB)
    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [contents, total] = await Promise.all([
      EducationContent.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      EducationContent.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: contents,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/education/categories
 * Get list of all available categories (static reference)
 */
router.get("/categories", (_req, res) => {
  res.json({
    success: true,
    data: [
      "Protection Protocol",
      "TB Awareness",
      "Treatment Guide",
      "Emergency Response",
    ],
  });
});

/**
 * GET /api/education/by-risk/:riskLevel
 * Get active education content targeted at a specific risk level
 * Used by mobile app to show relevant content based on patient's risk
 */
router.get("/by-risk/:riskLevel", async (req, res) => {
  try {
    const { riskLevel } = req.params;
    const validLevels = ["Low", "Moderate", "High", "Critical"];

    if (!validLevels.includes(riskLevel)) {
      return res.status(400).json({
        success: false,
        message: `Invalid risk level. Must be one of: ${validLevels.join(", ")}`,
      });
    }

    // Return content targeting this specific risk level OR content with no specific target (general)
    const contents = await EducationContent.find({
      is_active: true,
      $or: [{ risk_level_target: riskLevel }, { risk_level_target: null }],
    }).sort({ created_at: -1 });

    res.json({ success: true, count: contents.length, data: contents });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/education/:id
 * Get a single education content by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid content ID" });
    }

    const content = await EducationContent.findById(id);
    if (!content) {
      return res
        .status(404)
        .json({ success: false, message: "Education content not found" });
    }

    res.json({ success: true, data: content });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * POST /api/education
 * Create a new education content entry (admin only)
 * Body: { title, content_body, category, risk_level_target?, is_active? }
 */
router.post("/", async (req, res) => {
  try {
    const { title, content_body, category, risk_level_target, is_active } =
      req.body;

    if (!title || !content_body || !category) {
      return res.status(400).json({
        success: false,
        message: "title, content_body, and category are required",
      });
    }

    const content = await EducationContent.create({
      title,
      content_body,
      category,
      risk_level_target: risk_level_target || null,
      is_active: is_active !== undefined ? is_active : true,
      created_at: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Education content created",
      data: content,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * PUT /api/education/:id
 * Update an existing education content entry (admin only)
 * Body: any fields to update
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid content ID" });
    }

    const allowedFields = [
      "title",
      "content_body",
      "category",
      "risk_level_target",
      "is_active",
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const updated = await EducationContent.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Education content not found" });
    }

    res.json({
      success: true,
      message: "Education content updated",
      data: updated,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * PATCH /api/education/:id/toggle
 * Toggle is_active status of a content entry (admin only)
 */
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid content ID" });
    }

    const content = await EducationContent.findById(id);
    if (!content) {
      return res
        .status(404)
        .json({ success: false, message: "Education content not found" });
    }

    content.is_active = !content.is_active;
    await content.save();

    res.json({
      success: true,
      message: `Content ${content.is_active ? "activated" : "deactivated"}`,
      data: { _id: content._id, is_active: content.is_active },
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/education/:id
 * Permanently delete an education content entry (admin only)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid content ID" });
    }

    const deleted = await EducationContent.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Education content not found" });
    }

    res.json({ success: true, message: "Education content deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
