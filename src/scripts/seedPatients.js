// ============================================================
// scripts/seedPatients.js
//
// Seeds at least 5 patients per health center (34 facilities → 170
// patients), each with:
//   - A believable Filipino name, realistic adult demographics
//   - date_started randomized within the last ~165 days, so every
//     patient is currently mid-course inside their 6-month (168-day)
//     TB DOTS program — none finished, none in the future
//   - A regimen of ONLY HRZE (first 56 days / Intensive phase) or
//     HR (remaining days / Continuation phase) — matching the app's
//     own constraint that a patient is on HRZE, HR, or one specific
//     "Other" drug, never a made-up combination
//   - A full day-by-day MedicationLog history from date_started to
//     yesterday, with a randomized adherence profile per patient
//   - A compliance/risk_score computed by the SAME real engine
//     (utils/complianceEngine.js) the live app uses — nothing here
//     is a fabricated stat, it's derived from the logs actually
//     generated
//   - Symptom logs for a random subset of patients
//   - A companion patient User login (PIN-based)
//
// After all patients exist, Medicine Inventory is (re)built per
// health center per drug (HRZE, HR) using the same WHO/NTP
// weight-band formula (tbDosing.js) already used elsewhere in the
// app: total demand = tablets-per-dose (by weight) × doses still
// needed to finish, summed across that health center's patients
// currently on that drug, plus what's already been dispensed
// (tallied straight from the generated logs) and a stock buffer.
//
// Run with: node src/scripts/seedPatients.js
// ============================================================

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import "dotenv/config";

import Barangay from "../models/Barangay.model.js";
import Patient from "../models/Patient.model.js";
import User from "../models/User.model.js";
import MedicationLog from "../models/MedicationLog.model.js";
import SymptomLog from "../models/SymptomLog.model.js";
import Inventory from "../models/Inventory.model.js";

import { generateCaseNumber } from "../utils/caseNumberGenerator.js";
import { computePatientCompliance } from "../utils/complianceEngine.js";
import { suggestTabletsPerDose, TOTAL_COURSE_DOSES } from "../utils/tbDosing.js";

const { MONGODB_URI } = process.env;

const PATIENTS_PER_HEALTH_CENTER = 5;
const INTENSIVE_PHASE_DAYS = 56; // 2 months x 28 days
const DAY_MS = 86400000;

// ── Name pools ──────────────────────────────────────────────
// Kept disjoint from LAST_NAMES on purpose — a couple of these words
// (Domingo, Bernardo) are common as BOTH a Filipino first name and
// surname, but drawing first/middle/last independently from pools
// that share entries risks something like "Juan Santos Santos" or
// "Domingo Cruz Domingo", which reads as a generator bug, not a name.
// Mixes older Spanish-era names (more common among patients in their
// 50s-70s) with modern/compound English-Filipino names (more common
// among younger adult patients) — both are equally real across an
// 18-70 age range, not an inconsistency.
const MALE_FIRST_NAMES = [
  "Juan", "Jose", "Antonio", "Ramon", "Ricardo", "Eduardo", "Francisco",
  "Roberto", "Manuel", "Carlos", "Miguel", "Alfredo", "Danilo", "Rodrigo",
  "Ernesto", "Rolando", "Arnel", "Cesar", "Edgar", "Felipe", "Gerardo",
  "Renato", "Ignacio", "Jaime", "Leonardo", "Marlon", "Noel", "Oscar",
  "Vicente", "Wilfredo", "Alejandro", "Benigno", "Dominador", "Emmanuel",
  "Fidel", "Godofredo", "Hernani", "Isagani", "Julio", "Lauro",
  "Alex", "John Paul", "Mark Anthony", "Christian", "Jerome", "Kevin",
  "Justin", "Ryan", "Vince", "James", "Kyle", "Jhon Rey", "Michael",
  "Paolo", "Gabriel", "Nathaniel", "Xander", "William", "Elmer", "Rustom",
  "John Mark", "Mark Joseph", "Paul John", "Jay Ar", "Marc Gil",
  "Christian Paul", "Ken Aldrin", "John Carlo", "Mac Arthur", "Jay R",
];
const FEMALE_FIRST_NAMES = [
  "Maria", "Ana", "Rosario", "Carmen", "Teresita", "Josefina", "Corazon",
  "Remedios", "Luz", "Gloria", "Erlinda", "Angelica", "Bernadette", "Cecilia",
  "Divina", "Elena", "Fe", "Gemma", "Herminia", "Imelda", "Josephine",
  "Kristine", "Leonora", "Marites", "Norma", "Ofelia", "Perla", "Rosa",
  "Susana", "Victoria", "Amelia", "Belen", "Consuelo", "Dolores",
  "Estrella", "Flordeliza", "Guadalupe", "Honorata", "Isabel", "Lourdes",
  "Angel Grace", "Kate", "Nicole", "Danica", "Trisha", "Camille",
  "Kimberly", "Angelica Mae", "Rica", "Bianca", "Shaira", "Jasmine",
  "Michelle", "Krystal", "Aiza", "Charlene", "Grace Anne", "Yvonne",
  "Mary Grace", "Mary Joy", "Angel Mae", "Cherry Mae", "Rose Ann",
  "Jean Rose", "April Joy", "Anna Liza", "Cristy Jane", "Marie Claire",
];
const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza",
  "Torres", "Flores", "Ramos", "Villanueva", "Aquino", "Del Rosario",
  "Fernandez", "Castillo", "Gonzales", "Rivera", "Domingo", "Salazar",
  "Pascual", "Marquez", "Navarro", "Aguilar", "Bernardo", "Concepcion",
  "Dizon", "Espiritu", "Guevarra", "Lopez", "Manalo", "Abad", "Corpuz",
  "David", "Enriquez", "Fajardo", "Gatchalian", "Ilagan", "Javier",
  "Lacson", "Macaraeg", "Nepomuceno", "Ortiz", "Pineda", "Quiambao",
  "Robles", "Sarmiento", "Tolentino", "Uy", "Valdez", "Yamzon",
  // Less common surnames, mixed in so the pool doesn't lean entirely
  // on the half-dozen most frequent Filipino surnames.
  "Buenaventura", "Katigbak", "Panganiban", "Bulaong", "Dimaculangan",
  "Villaraza", "Zulueta", "Calderon", "Dacanay", "Escueta", "Gatdula",
  "Hizon", "Inocencio", "Jacinto", "Kabigting", "Locsin", "Ongsiako",
  "Quisumbing", "Salonga", "Villaroman", "Alcantara", "Buensalido",
  "Dimayuga", "Feliciano", "Ilustre", "Kalaw",
];

// Ensures the three name parts a patient ends up with are never
// pairwise identical (e.g. middle name landing on the same surname
// as the last name), which would otherwise look like a bug rather
// than a real name.
function pickDistinctName(pool, taken) {
  let candidate = pick(pool);
  let attempts = 0;
  while (taken.includes(candidate) && attempts < 20) {
    candidate = pick(pool);
    attempts++;
  }
  return candidate;
}

const SYMPTOMS = [
  "Nausea", "Vomiting", "Rash", "Joint Pain", "Dizziness",
  "Blurred Vision", "Abdominal Pain", "Fever", "Fatigue", "Other",
];

// The app's OWN compliance engine (utils/complianceEngine.js) derives
// risk_level purely from the CONSECUTIVE missed-dose streak counting
// backward from the most recent logged day: >=56 => Defaulter (2 full
// 28-day treatment months missed in a row), >=2 => At Risk, else
// Compliant. A pure day-by-day random walk with a per-day "recovery
// chance" (the earlier approach here) essentially never produces a
// real unbroken streak that long — the math works against it (a
// streak with even a 50% daily recovery chance has an expected length
// of just 2 days). So outcomes are assigned directly: each patient is
// given a target bucket, and the FORCED number of consecutive missed
// days ending on their most recent logged day is picked to land in
// that bucket. Everything before that tail is still randomized for
// realistic day-to-day variance.
const OUTCOME_BUCKETS = [
  { name: "Compliant", weight: 60, tailMissRange: [0, 0], backgroundTakenChance: 0.96 },
  { name: "At Risk", weight: 25, tailMissRange: [2, 40], backgroundTakenChance: 0.90 },
  { name: "Defaulter", weight: 15, tailMissRange: [56, 140], backgroundTakenChance: 0.90 },
];

function pickWeighted(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    if (r < it.weight) return it;
    r -= it.weight;
  }
  return items[0];
}

// ── Helpers ──────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;

const dateOnly = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

let phoneSeq = 900000000;
const nextPhoneNumber = () => `+639${String(phoneSeq++).slice(-9)}`;

let patientIdSeq = 1;
const nextPatientId = () => `PT-${String(patientIdSeq++).padStart(4, "0")}`;

let userIdSeq = 1;
const nextUserId = () => `USR-${String(userIdSeq++).padStart(4, "0")}`;

let medLogSeq = 1;
const nextMedLogId = () => `MED-LOG-${String(medLogSeq++).padStart(6, "0")}`;

let symptomLogSeq = 1;
const nextSymptomLogId = () => `SYM-LOG-${String(symptomLogSeq++).padStart(6, "0")}`;

let inventorySeq = 1;
const nextInventoryId = () => `INV-${String(inventorySeq++).padStart(4, "0")}`;

async function run() {
  await mongoose.connect(MONGODB_URI);

  // The Inventory model's unique index used to be scoped to barangay
  // (pre-dating multi-health-center barangays); Mongoose won't drop
  // that stale index on its own even though the schema has moved on.
  await Inventory.syncIndexes();

  console.log("── Clearing existing patient data ──");
  for (const [name, coll] of [
    ["patients", Patient], ["medication_logs", MedicationLog],
    ["symptom_logs", SymptomLog], ["medicine_inventory", Inventory],
  ]) {
    const { deletedCount } = await coll.deleteMany({});
    console.log(`  🗑️  ${name}: removed ${deletedCount}`);
  }
  const { deletedCount: patientUsersDeleted } = await User.deleteMany({ role: "patient" });
  console.log(`  🗑️  users (role=patient): removed ${patientUsersDeleted}`);

  // Reset sequence counters against whatever staff already exists.
  const existingUsers = await User.find({}, "user_id").lean();
  const existingUserNums = existingUsers
    .map((u) => parseInt(u.user_id?.split("-")[1], 10))
    .filter((n) => !isNaN(n));
  userIdSeq = (existingUserNums.length ? Math.max(...existingUserNums) : 0) + 1;

  const superAdmin = await User.findOne({ role: "super_admin" }).lean();
  const staff = await User.find({ role: { $in: ["nurse", "barangay_admin"] } }).lean();

  const registeredByForHealthCenter = (healthCenterId) => {
    const nurse = staff.find((s) => s.health_center_id === healthCenterId && s.role === "nurse");
    if (nurse) return nurse.user_id;
    const admin = staff.find((s) => s.health_center_id === healthCenterId && s.role === "barangay_admin");
    if (admin) return admin.user_id;
    return superAdmin?.user_id || "USR-0001";
  };

  const barangays = await Barangay.find({});
  const today = dateOnly(new Date());

  // Per health-center-per-drug accumulator for the inventory rebuild.
  const inventoryAgg = {}; // key: `${health_center_id}|${drug}` -> {...}
  const ensureAggBucket = (hcId, drug) => {
    const key = `${hcId}|${drug}`;
    if (!inventoryAgg[key]) {
      inventoryAgg[key] = {
        barangay_id: null, health_center_id: hcId, drug_name: drug,
        totalDispensed: 0, activePatients: 0, remainingDemandTablets: 0,
      };
    }
    return inventoryAgg[key];
  };

  const allMedicationLogs = [];
  const allSymptomLogs = [];
  const patientUserDocs = [];
  const credentialSamples = [];

  let totalPatients = 0;

  for (const barangay of barangays) {
    for (const hc of barangay.health_centers || []) {
      const registeredBy = registeredByForHealthCenter(hc.health_center_id);
      ensureAggBucket(hc.health_center_id, "HRZE").barangay_id = barangay.barangay_id;
      ensureAggBucket(hc.health_center_id, "HR").barangay_id = barangay.barangay_id;

      for (let i = 0; i < PATIENTS_PER_HEALTH_CENTER; i++) {
        const sex = chance(0.5) ? "Male" : "Female";
        const firstName = pick(sex === "Male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const middleName = pickDistinctName(LAST_NAMES, [lastName]);

        const age = randInt(18, 70);
        const birthDate = new Date(today);
        birthDate.setFullYear(birthDate.getFullYear() - age);
        birthDate.setDate(birthDate.getDate() - randInt(0, 364));

        const weightKg = sex === "Male" ? randInt(50, 85) : randInt(40, 68);
        const heightCm = sex === "Male" ? randInt(160, 178) : randInt(150, 165);

        const daysAgoStarted = randInt(5, 165);
        const dateStarted = new Date(today.getTime() - daysAgoStarted * DAY_MS);
        const dateOfDiagnosis = new Date(dateStarted.getTime() - randInt(0, 7) * DAY_MS);

        const treatmentPhase = daysAgoStarted <= INTENSIVE_PHASE_DAYS ? "Intensive" : "Continuation";
        // Phase is a function of days elapsed, computed the same way per log day below.
        const currentDrug = treatmentPhase === "Intensive" ? "HRZE" : "HR";
        const tabletsPerDose = suggestTabletsPerDose(weightKg) || 4;

        const patientId = nextPatientId();
        const tbCaseNumber = await generateCaseNumber();
        const endDate = new Date(dateStarted);
        endDate.setMonth(endDate.getMonth() + 6);

        const sputumSchedule = [2, 5, 6].map((month) => {
          const due = new Date(dateStarted);
          due.setMonth(due.getMonth() + month);
          return { month, due_date: due, status: "Pending" };
        });

        const numContacts = randInt(0, 3);
        const contactNames = Array.from({ length: numContacts }, () => `${pick([...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES])} ${pick(LAST_NAMES)}`);

        const nameParts = [firstName, middleName, lastName].filter(Boolean);

        const patient = new Patient({
          patient_id: patientId,
          tb_case_number: tbCaseNumber,
          user_id: null, // set after companion User is created below
          registered_by: registeredBy,
          last_name: lastName,
          first_name: firstName,
          middle_name: middleName,
          full_name: nameParts.join(" "),
          birth_date: birthDate,
          age,
          sex,
          weight_kg: weightKg,
          height_cm: heightCm,
          philhealth_number: null,
          phone_number: nextPhoneNumber(),
          email: null,
          barangay_id: barangay.barangay_id,
          barangay_name: barangay.name,
          health_center_id: hc.health_center_id,
          health_center_name: hc.name,
          assigned_nurse_id: staff.find((s) => s.health_center_id === hc.health_center_id && s.role === "nurse")?.user_id || null,
          diagnosis: "Pulmonary TB",
          date_of_diagnosis: dateOfDiagnosis,
          classification: chance(0.9) ? "Pulmonary" : "Extra-pulmonary",
          bacteriological_status: chance(0.7) ? "Bacteriologically Confirmed" : "Clinically Diagnosed",
          patient_type: {
            is_new: chance(0.85),
            is_retreatment: false,
            is_drug_susceptible: true,
            is_drug_resistant: false,
          },
          treatment_phase: treatmentPhase,
          location_of_treatment: "Health Facility",
          date_started: dateStarted,
          end_date: endDate,
          treatment_duration_months: 6,
          schedule_of_treatment: dateStarted,
          dat_support: chance(0.6) ? "Direct Observed Treatment" : "Self-administered",
          regimen_type: "2HRZE/4HR",
          drug_regimen: [{ drug_name: currentDrug, strength: "", unit: "tablet", number_to_be_taken: tabletsPerDose }],
          treatment_supporter: { name: null, contact: null },
          treatment_outcome: { status: "On Treatment", date_of_outcome: null, recorded_by: null },
          contact_tracing: { number_of_contacts: numContacts, contact_names: contactNames, schedule: null },
          additional_notes: "",
          sputum_test_schedule: sputumSchedule,
          compliance: { total_doses_required: TOTAL_COURSE_DOSES },
          escalation: { level: 0, escalated_at: null, escalated_by: "system", acknowledged_by: null, acknowledged_at: null, notes: "" },
          is_active: true,
        });
        patient.patient_type.is_retreatment = chance(0.15);
        if (patient.patient_type.is_retreatment) patient.patient_type.is_new = false;

        await patient.save();
        totalPatients++;

        // ── Medication logs: one per day from date_started to yesterday ──
        const lastLogDay = new Date(Math.min(today.getTime() - DAY_MS, dateStarted.getTime() + (TOTAL_COURSE_DOSES - 1) * DAY_MS));
        const totalLogDays = Math.round((lastLogDay - dateStarted) / DAY_MS) + 1;

        const bucket = pickWeighted(OUTCOME_BUCKETS);
        const [tailMin, tailMax] = bucket.tailMissRange;
        // A patient who only started a few days ago can't yet have a
        // 14-day streak — cap to what history they actually have
        // rather than forcing an impossible run.
        const tailMissRun = Math.min(randInt(tailMin, tailMax), totalLogDays);

        for (let cursor = new Date(dateStarted); cursor <= lastLogDay; cursor = new Date(cursor.getTime() + DAY_MS)) {
          const dayOffset = Math.round((cursor - dateStarted) / DAY_MS);
          const drugForDay = dayOffset < INTENSIVE_PHASE_DAYS ? "HRZE" : "HR";

          const daysFromEnd = Math.round((lastLogDay - cursor) / DAY_MS);
          const taken = daysFromEnd < tailMissRun ? false : chance(bucket.backgroundTakenChance);

          const status = taken ? "Taken" : "Missed";
          allMedicationLogs.push({
            log_id: nextMedLogId(),
            patient_id: patientId,
            tb_case_number: tbCaseNumber,
            barangay_id: barangay.barangay_id,
            log_date: new Date(cursor),
            logged_at: new Date(cursor),
            logged_by: chance(0.1) ? "nurse" : "patient",
            treatment_day: dayOffset + 1,
            medicines: [{
              drug_name: drugForDay,
              strength: drugForDay, // FDC — no separate numeric strength, see Patient model
              unit: "tablet",
              number_to_be_taken: tabletsPerDose,
              status,
              taken_at: taken ? new Date(cursor) : null,
            }],
            overall_status: status,
            notes: "",
            created_at: new Date(cursor),
          });

          const dispenseBucket = ensureAggBucket(hc.health_center_id, drugForDay);
          if (taken) dispenseBucket.totalDispensed += tabletsPerDose;
        }

        // Track ongoing demand for whatever drug the patient is CURRENTLY on.
        const currentBucket = ensureAggBucket(hc.health_center_id, currentDrug);
        currentBucket.activePatients += 1;

        // ── Symptom logs for a random subset of patients ──
        if (chance(0.4)) {
          const entries = randInt(1, 3);
          for (let s = 0; s < entries; s++) {
            const loggedAt = new Date(dateStarted.getTime() + randInt(0, Math.max(1, Math.round((lastLogDay - dateStarted) / DAY_MS))) * DAY_MS);
            allSymptomLogs.push({
              log_id: nextSymptomLogId(),
              patient_id: patientId,
              tb_case_number: tbCaseNumber,
              barangay_id: barangay.barangay_id,
              logged_at: loggedAt,
              symptoms: [{ symptom: pick(SYMPTOMS), severity: randInt(1, 3) }],
              free_text_notes: "",
              reviewed_by: null,
              reviewed_at: null,
              created_at: loggedAt,
            });
          }
        }

        // ── Companion patient login account ──
        const defaultPin = randomInt(1000, 10000).toString();
        const pinHash = await bcrypt.hash(defaultPin, 12);
        const mobileUserId = nextUserId();

        patient.user_id = mobileUserId;
        await Patient.updateOne({ patient_id: patientId }, { $set: { user_id: mobileUserId } });

        patientUserDocs.push({
          user_id: mobileUserId,
          role: "patient",
          first_name: firstName,
          last_name: lastName,
          email: null,
          phone_number: patient.phone_number,
          tb_case_number: tbCaseNumber,
          patient_id: patientId,
          pin_hash: pinHash,
          barangay_id: barangay.barangay_id,
          barangay_name: barangay.name,
          health_center_id: hc.health_center_id,
          phone_verified: false,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        if (credentialSamples.length < 4) {
          credentialSamples.push({
            name: patient.full_name,
            health_center: hc.name,
            patient_id: patientId,
            tb_case_number: tbCaseNumber,
            phone_number: patient.phone_number,
            pin: defaultPin,
          });
        }
      }
    }
  }

  console.log(`\n✅ Created ${totalPatients} patients.`);

  console.log("── Inserting medication logs ──");
  for (let i = 0; i < allMedicationLogs.length; i += 2000) {
    await MedicationLog.insertMany(allMedicationLogs.slice(i, i + 2000), { ordered: false });
  }
  console.log(`  ✅ Inserted ${allMedicationLogs.length} medication logs.`);

  if (allSymptomLogs.length) {
    await SymptomLog.insertMany(allSymptomLogs, { ordered: false });
    console.log(`  ✅ Inserted ${allSymptomLogs.length} symptom logs.`);
  }

  console.log("── Creating patient login accounts ──");
  await User.insertMany(patientUserDocs, { ordered: false });
  console.log(`  ✅ Inserted ${patientUserDocs.length} patient user accounts.`);

  console.log("── Computing real compliance/risk from generated logs ──");
  const allPatients = await Patient.find({});
  for (const patient of allPatients) {
    const { compliance, risk_score } = await computePatientCompliance(patient);
    await Patient.updateOne({ patient_id: patient.patient_id }, { $set: { compliance, risk_score } });
  }
  console.log(`  ✅ Compliance computed for ${allPatients.length} patients.`);

  console.log("── Rebuilding medicine inventory from real demand ──");
  // Now that compliance is final, fold each patient's doses_remaining
  // (on their CURRENT drug) into the demand accumulator.
  const finalPatients = await Patient.find({}, "health_center_id drug_regimen weight_kg compliance");
  for (const p of finalPatients) {
    const drugName = p.drug_regimen?.[0]?.drug_name;
    if (!["HRZE", "HR"].includes(drugName)) continue;
    const tabletsPerDose = suggestTabletsPerDose(p.weight_kg) || 4;
    const bucket = ensureAggBucket(p.health_center_id, drugName);
    bucket.remainingDemandTablets += tabletsPerDose * (p.compliance?.doses_remaining ?? 0);
  }

  let inventoryCount = 0;
  for (const key of Object.keys(inventoryAgg)) {
    const bucket = inventoryAgg[key];
    if (!bucket.barangay_id) continue; // shouldn't happen, guards against stray keys

    // Most health centers get a comfortable buffer; ~1 in 5 runs lean,
    // so the dashboard shows a believable mix of OK/Low/Critical.
    const buffer = chance(0.2) ? randInt(70, 105) / 100 : randInt(120, 165) / 100;
    const baselineFloor = 40; // never look emptily-stocked for a facility that treats patients

    // A health center with 0 patients CURRENTLY on this drug (common —
    // e.g. nobody happens to be in the Intensive phase right now) still
    // needs to be ready for the next patient who starts it. Without this
    // floor, remainingDemandTablets would be 0 and total_allocated would
    // collapse to exactly total_dispensed, showing a false "Stockout"
    // for a facility that's actually just between intensive-phase cases.
    const READINESS_TABLETS_PER_DOSE = 4; // typical adult weight-band dose
    const oneCourseReadinessStock = READINESS_TABLETS_PER_DOSE * TOTAL_COURSE_DOSES;
    const bufferedDemand = Math.max(bucket.remainingDemandTablets, oneCourseReadinessStock);

    const totalAllocated = Math.max(
      baselineFloor,
      Math.round(bucket.totalDispensed + bufferedDemand * buffer)
    );
    const remainingStock = Math.max(0, totalAllocated - bucket.totalDispensed);

    const expiryDate = new Date(today.getTime() + randInt(180, 730) * DAY_MS);

    const inv = new Inventory({
      inventory_id: nextInventoryId(),
      barangay_id: bucket.barangay_id,
      health_center_id: bucket.health_center_id,
      drug_name: bucket.drug_name,
      strength: "",
      unit: "tablet",
      total_allocated: totalAllocated,
      total_dispensed: bucket.totalDispensed,
      remaining_stock: remainingStock,
      active_patients_on_this_drug: bucket.activePatients,
      expiry_date: expiryDate,
      last_dispensed_at: bucket.totalDispensed > 0 ? new Date() : null,
    });
    await inv.save(); // pre-save hook derives stock_status from remaining_stock
    inventoryCount++;
  }
  console.log(`  ✅ Created ${inventoryCount} inventory line items across all health centers.`);

  console.log("\n📋 Sample patient login credentials (mobile app):");
  for (const c of credentialSamples) {
    console.log(`  ${c.name} (${c.health_center})`);
    console.log(`    Login ID: ${c.tb_case_number} or ${c.phone_number}`);
    console.log(`    PIN: ${c.pin}`);
  }

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
