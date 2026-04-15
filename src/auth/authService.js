/**
 * authService.js
 *
 * Handles all authentication logic:
 *   - PIN hashing via the Web Crypto API (SHA-256, no extra dependencies)
 *   - JWT creation and verification via `jose` (HS256, symmetric key)
 *   - PIN and token persistence in localStorage
 *
 * Designed so that Google OAuth can be dropped in later. The rest of the app
 * only consumes the JWT payload — swapping the issuer doesn't require any
 * other changes.
 */

import { SignJWT, jwtVerify } from 'jose';

const PINS_KEY    = 'chorecoin-pins';
const TOKEN_KEY   = 'chorecoin-token';
const SECRET_KEY  = 'chorecoin-secret';

// ─── JWT secret ──────────────────────────────────────────────────────────────

/**
 * Returns the 32-byte HMAC signing key, creating it on first use.
 * The raw bytes are base64-encoded and stored in localStorage.
 * When moving to a backend, replace this with a server-supplied secret.
 */
function getOrCreateSecret() {
  let stored = localStorage.getItem(SECRET_KEY);
  if (!stored) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    stored = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(SECRET_KEY, stored);
  }
  return new TextEncoder().encode(stored);
}

// ─── PIN helpers ─────────────────────────────────────────────────────────────

/** Returns the hex-encoded SHA-256 digest of a PIN string. */
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── PIN storage ─────────────────────────────────────────────────────────────

function getPins() {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '{}'); }
  catch { return {}; }
}

function savePins(pins) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** True if no parent PIN has been set yet (first run). */
export function isFirstRun() {
  return !getPins().parentPin;
}

/** Hash and persist the parent PIN. */
export async function setupParentPin(pin) {
  const pins = getPins();
  pins.parentPin = await hashPin(pin);
  savePins(pins);
}

/** Hash and persist a PIN for a specific kid. Called by the parent. */
export async function setKidPin(kidId, pin) {
  const pins = getPins();
  if (!pins.kidPins) pins.kidPins = {};
  pins.kidPins[String(kidId)] = await hashPin(pin);
  savePins(pins);
}

/** True if the given kid has had a PIN set by the parent. */
export function kidHasPin(kidId) {
  const pins = getPins();
  return !!(pins.kidPins?.[String(kidId)]);
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function createToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getOrCreateSecret());
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Verifies the parent PIN and, on success, writes a JWT to localStorage.
 * @returns {boolean} true if login succeeded.
 */
export async function loginAsParent(pin) {
  const pins = getPins();
  if (!pins.parentPin) return false;
  if (await hashPin(pin) !== pins.parentPin) return false;
  localStorage.setItem(TOKEN_KEY, await createToken({ role: 'parent', name: 'Parent' }));
  return true;
}

/**
 * Verifies a kid's PIN and, on success, writes a JWT to localStorage.
 * @returns {boolean} true if login succeeded.
 */
export async function loginAsKid(kidId, kidName, pin) {
  const pins = getPins();
  const stored = pins.kidPins?.[String(kidId)];
  if (!stored) return false;
  if (await hashPin(pin) !== stored) return false;
  localStorage.setItem(TOKEN_KEY, await createToken({ role: 'kid', kidId, name: kidName }));
  return true;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Reads and verifies the stored JWT.
 * @returns {{ role, kidId, name } | null} The decoded payload, or null if
 *   there is no token or it has expired / been tampered with.
 */
export async function getCurrentUser() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getOrCreateSecret());
    return {
      role:  payload.role,
      kidId: payload.kidId ?? null,
      name:  payload.name,
    };
  } catch {
    // Expired or invalid — clear it
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

/** Removes the stored JWT, ending the session. */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}
