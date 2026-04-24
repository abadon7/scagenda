import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

export const loginWithCongregationCode = onCall({ cors: true }, async (request) => {
  const rawName = String(request.data?.congregationName || "");
  const congregationName = rawName.split("-")[0].trim();
  const code = String(request.data?.code || "").trim();

  if (!congregationName || !code) {
    throw new HttpsError("invalid-argument", "Missing congregation name or code.");
  }

  const congregation = await findCongregation(rawName, code);

  if (!congregation) {
    throw new HttpsError("permission-denied", "Invalid congregation or code.");
  }

  if (congregation.loginEnabled === false) {
    throw new HttpsError("failed-precondition", "Congregation login is disabled.");
  }

  if (!congregation.congregationNumber) {
    throw new HttpsError("failed-precondition", "Congregation number is not configured.");
  }

  if (String(congregation.congregationNumber).trim() !== code) {
    throw new HttpsError("permission-denied", "Invalid congregation or code.");
  }

  const resolvedName = congregation.name ? String(congregation.name).split("-")[0].trim() : congregationName;

  const token = await adminAuth.createCustomToken(`congregation:${congregation.id}`, {
    role: "congregation",
    congregation_id: congregation.id,
    congregation_name: resolvedName,
  });

  return {
    token,
    congregationId: congregation.id,
    congregationName: resolvedName,
  };
});

async function findCongregation(congregationName, code) {
  const normalized = normalizeAlias(congregationName);
  const congregationsRef = db.collection("congregations");

  const aliasSnapshot = await congregationsRef.where("loginAlias", "==", normalized).limit(1).get();
  if (!aliasSnapshot.empty) {
    return { id: aliasSnapshot.docs[0].id, ...aliasSnapshot.docs[0].data() };
  }

  const nameSnapshot = await congregationsRef.where("name", "==", congregationName).limit(1).get();
  if (!nameSnapshot.empty) {
    return { id: nameSnapshot.docs[0].id, ...nameSnapshot.docs[0].data() };
  }

  if (code) {
    // Fallback: search by code and see if the name partially matches
    const codeStrSnapshot = await congregationsRef.where("congregationNumber", "==", code).limit(1).get();
    if (!codeStrSnapshot.empty) {
      const doc = codeStrSnapshot.docs[0].data();
      const dbNameNormalized = normalizeAlias(doc.name || "").split("-")[0].trim();
      const inputNameNormalized = normalized.split("-")[0].trim();
      
      if (dbNameNormalized === inputNameNormalized) {
        return { id: codeStrSnapshot.docs[0].id, ...doc };
      }
    }
    
    // Try number format just in case
    const codeNumSnapshot = await congregationsRef.where("congregationNumber", "==", Number(code)).limit(1).get();
    if (!codeNumSnapshot.empty) {
      const doc = codeNumSnapshot.docs[0].data();
      const dbNameNormalized = normalizeAlias(doc.name || "").split("-")[0].trim();
      const inputNameNormalized = normalized.split("-")[0].trim();
      
      if (dbNameNormalized === inputNameNormalized) {
        return { id: codeNumSnapshot.docs[0].id, ...doc };
      }
    }
  }

  return null;
}

function normalizeAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
