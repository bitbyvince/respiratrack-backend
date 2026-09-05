import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import User from "../../models/User.model.js";
import { createError } from "../../utils/apiResponse.js";
import ROLES, { isSuperAdminLevel } from "../../constants/roles.js";

const HIDDEN_FIELDS = "-password_hash -pin_hash -refresh_token_hash";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(parseInt(query.limit) || DEFAULT_LIMIT, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const assertSameBarangay = (requester, targetBarangayId) => {
  if (
    requester.role === ROLES.BARANGAY_ADMIN &&
    requester.barangay_id !== targetBarangayId
  ) {
    throw createError(
      403,
      "Access denied. User belongs to a different barangay.",
    );
  }
};

const assertCanCreateRole = (requester, targetRole) => {
  if (requester.role === ROLES.BARANGAY_ADMIN && targetRole !== ROLES.NURSE) {
    throw createError(403, "Barangay admins can only create nurse accounts.");
  }
  if (targetRole === ROLES.PATC && requester.role !== ROLES.SUPER_ADMIN) {
    throw createError(403, "Only super admins can create patc accounts.");
  }
  if (isSuperAdminLevel(requester.role) && targetRole === ROLES.PATIENT) {
    throw createError(
      400,
      "Use the patient account endpoint to create patient accounts.",
    );
  }
};

const generateUserId = async () => {
  const users = await User.find({}, 'user_id').lean();
  if (!users.length) return 'USR-0001';
  
  const nums = users
    .map(u => parseInt(u.user_id?.split('-')[1]))
    .filter(n => !isNaN(n));
  
  const max = Math.max(...nums);
  return `USR-${String(max + 1).padStart(4, '0')}`;
};

export const listStaff = async (filters = {}) => {
  const { page, limit, skip } = getPagination(filters);
  const query = {
    role: { $in: [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC] },
    ...(filters.barangay_id && { barangay_id: filters.barangay_id }),
    ...(filters.role && { role: filters.role }),
    ...(filters.is_active !== undefined && {
      is_active: filters.is_active === "true",
    }),
  };
  const [users, total] = await Promise.all([
    User.find(query)
      .select(HIDDEN_FIELDS)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 }),
    User.countDocuments(query),
  ]);
  return { users, total, page, limit };
};

export const getStaffById = async (userId, requester) => {
  const user = await User.findOne({
    user_id: userId,
    role: { $in: [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC] },
  }).select(HIDDEN_FIELDS);
  if (!user) throw createError(404, "Staff account not found.");
  if (requester.role === ROLES.BARANGAY_ADMIN)
    assertSameBarangay(requester, user.barangay_id);
  return user;
};

export const createStaff = async (data, requester) => {
  assertCanCreateRole(requester, data.role);

  if (requester.role === ROLES.BARANGAY_ADMIN) {
    data.barangay_id = requester.barangay_id;
    data.barangay_name = requester.barangay_name;       // ← add this
    data.health_center_id = requester.health_center_id;
  }

  // ── Validate barangay & health center for barangay-scoped roles ──
  if (!isSuperAdminLevel(data.role)) {
    if (!data.barangay_id)
      throw createError(400, 'barangay_id is required for this role.');
    if (!data.health_center_id)
      throw createError(400, 'health_center_id is required for this role.');
  }

  const existing = await User.findOne({ email: data.email });
  if (existing)
    throw createError(409, 'A user with this email already exists.');

  const userId = await generateUserId();
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = new User({
    user_id: userId,
    role: data.role,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    password_hash: passwordHash,
    phone_number: data.phone_number || null,
    barangay_id: data.barangay_id || null,
    barangay_name: data.barangay_name || null,
    health_center_id: data.health_center_id || null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await user.save();

  const result = user.toObject();
  delete result.password_hash;
  delete result.pin_hash;
  delete result.refresh_token_hash;
  return result;
};

export const updateStaff = async (userId, data, requester) => {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "Staff account not found.");
  if (requester.role === ROLES.BARANGAY_ADMIN)
    assertSameBarangay(requester, user.barangay_id);
  if (data.email && data.email !== user.email) {
    const conflict = await User.findOne({ email: data.email });
    if (conflict) throw createError(409, "Email is already in use.");
  }
  return User.findOneAndUpdate(
    { user_id: userId },
    {
      ...(data.first_name && { first_name: data.first_name }),
      ...(data.last_name && { last_name: data.last_name }),
      ...(data.email && { email: data.email }),
      ...(data.phone_number !== undefined && {
        phone_number: data.phone_number,
      }),
      updated_at: new Date(),
    },
    { new: true },
  ).select(HIDDEN_FIELDS);
};

export const setStaffActiveStatus = async (userId, isActive, requester) => {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "Staff account not found.");
  if (user.role === ROLES.SUPER_ADMIN)
    throw createError(403, "Super admin accounts cannot be deactivated.");
  if (requester.role === ROLES.BARANGAY_ADMIN)
    assertSameBarangay(requester, user.barangay_id);
  await User.findOneAndUpdate(
    { user_id: userId },
    { is_active: isActive, updated_at: new Date() },
  );
};

export const deleteStaff = async (userId, requester) => {
  if (!isSuperAdminLevel(requester.role))
    throw createError(
      403,
      "Only super admins can permanently delete accounts.",
    );
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "Staff account not found.");
  if (user.role === ROLES.SUPER_ADMIN)
    throw createError(403, "Cannot delete a super admin account.");
  await User.deleteOne({ user_id: userId });
};

export const listPatientAccounts = async (filters = {}) => {
  const { page, limit, skip } = getPagination(filters);
  const query = {
    role: ROLES.PATIENT,
    ...(filters.barangay_id && { barangay_id: filters.barangay_id }),
    ...(filters.is_active !== undefined && {
      is_active: filters.is_active === "true",
    }),
  };
  const [users, total] = await Promise.all([
    User.find(query)
      .select(HIDDEN_FIELDS)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 }),
    User.countDocuments(query),
  ]);
  return { users, total, page, limit };
};

export const getPatientAccountById = async (userId, requester) => {
  const user = await User.findOne({
    user_id: userId,
    role: ROLES.PATIENT,
  }).select(HIDDEN_FIELDS);
  if (!user) throw createError(404, "Patient account not found.");
  if (requester.role !== ROLES.SUPER_ADMIN)
    assertSameBarangay(requester, user.barangay_id);
  return user;
};

export const createPatientAccount = async (data, requester) => {
  const existing = await User.findOne({
    $or: [
      { tb_case_number: data.tb_case_number },
      { phone_number: data.phone_number },
      ...(data.email ? [{ email: data.email }] : []),
    ],
  });
  if (existing)
    throw createError(
      409,
      "An account with this TB case number, phone number, or email already exists.",
    );

  const userId = await generateUserId();
  const pinHash = await bcrypt.hash(data.pin, 12);

  const user = new User({
    user_id: userId,
    role: ROLES.PATIENT,
    first_name: data.first_name,
    last_name: data.last_name,
    tb_case_number: data.tb_case_number,
    phone_number: data.phone_number,
    email: data.email || null,
    pin_hash: pinHash,
    password_hash: null,
    patient_id: data.patient_id,
    barangay_id: requester.barangay_id,
    health_center_id: requester.health_center_id,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  await user.save();

  const result = user.toObject();
  delete result.pin_hash;
  delete result.password_hash;
  delete result.refresh_token_hash;
  return result;
};

export const updatePatientAccount = async (userId, data, requester) => {
  const user = await User.findOne({ user_id: userId, role: ROLES.PATIENT });
  if (!user) throw createError(404, "Patient account not found.");
  if (requester.role !== ROLES.SUPER_ADMIN)
    assertSameBarangay(requester, user.barangay_id);

  if (data.phone_number && data.phone_number !== user.phone_number) {
    const conflict = await User.findOne({ phone_number: data.phone_number });
    if (conflict) throw createError(409, "Phone number is already in use.");
  }
  if (data.email && data.email !== user.email) {
    const conflict = await User.findOne({ email: data.email });
    if (conflict) throw createError(409, "Email is already in use.");
  }

  const updates = {
    ...(data.phone_number && { phone_number: data.phone_number }),
    ...(data.email !== undefined && { email: data.email }),
    updated_at: new Date(),
  };
  if (data.new_pin) updates.pin_hash = await bcrypt.hash(data.new_pin, 12);

  return User.findOneAndUpdate({ user_id: userId }, updates, {
    new: true,
  }).select(HIDDEN_FIELDS);
};

export const setPatientAccountActiveStatus = async (
  userId,
  isActive,
  requester,
) => {
  const user = await User.findOne({ user_id: userId, role: ROLES.PATIENT });
  if (!user) throw createError(404, "Patient account not found.");
  if (requester.role !== ROLES.SUPER_ADMIN)
    assertSameBarangay(requester, user.barangay_id);
  await User.findOneAndUpdate(
    { user_id: userId },
    { is_active: isActive, updated_at: new Date() },
  );
};

export const getUserById = async (userId) => {
  const user = await User.findOne({ user_id: userId }).select(HIDDEN_FIELDS);
  if (!user) throw createError(404, "User not found.");
  return user;
};

export const updateMyProfile = async (userId, data) => {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "User not found.");
  if (data.email && data.email !== user.email) {
    const conflict = await User.findOne({ email: data.email });
    if (conflict) throw createError(409, "Email is already in use.");
  }
  return User.findOneAndUpdate(
    { user_id: userId },
    {
      ...(data.email && data.email !== user.email && { email: data.email }),
      ...(data.phone_number && { phone_number: data.phone_number }),
      ...(user.role !== ROLES.PATIENT &&
        data.first_name && { first_name: data.first_name }),
      ...(user.role !== ROLES.PATIENT &&
        data.last_name && { last_name: data.last_name }),
      updated_at: new Date(),
    },
    { new: true },
  ).select(HIDDEN_FIELDS);
};

export const resetPatientPin = async (patientId, requester) => {
  const user = await User.findOne({ patient_id: patientId, role: ROLES.PATIENT });
  if (!user) throw createError(404, 'No mobile account found for this patient.');
  if (requester.role !== ROLES.SUPER_ADMIN)
    assertSameBarangay(requester, user.barangay_id);

  const newPin = randomInt(1000, 10000).toString();
  const pinHash = await bcrypt.hash(newPin, 12);

  await User.findOneAndUpdate(
    { patient_id: patientId },
    { pin_hash: pinHash, updated_at: new Date() },
  );

  return { newPin };
};
