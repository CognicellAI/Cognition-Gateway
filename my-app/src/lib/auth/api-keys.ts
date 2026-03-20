/**
 * API key utilities — Layer 1/2
 *
 * Handles generation, hashing, and verification of API keys.
 * Keys follow the format: cgw_<32 random hex chars>
 * The full key is shown exactly once at creation; only a bcrypt hash is stored.
 */

import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

const KEY_PREFIX = "cgw_";
const BCRYPT_ROUNDS = 12;

/**
 * Generate a new API key.
 * Returns the full plaintext key (to be shown to the user once) and the prefix
 * (first 8 chars of the key, stored for display).
 */
export function generateApiKey(): { fullKey: string; prefix: string } {
  const random = randomBytes(16).toString("hex"); // 32 hex chars
  const fullKey = `${KEY_PREFIX}${random}`;
  const prefix = fullKey.slice(0, 12); // "cgw_" + first 8 hex chars
  return { fullKey, prefix };
}

/**
 * Hash an API key for storage.
 */
export async function hashApiKey(fullKey: string): Promise<string> {
  return bcrypt.hash(fullKey, BCRYPT_ROUNDS);
}

/**
 * Verify an API key against its stored hash.
 */
export async function verifyApiKey(fullKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(fullKey, hash);
}
