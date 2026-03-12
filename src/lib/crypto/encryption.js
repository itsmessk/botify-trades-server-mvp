const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} text - The plaintext to encrypt
 * @param {string} secretKey - 64-char hex string (32 bytes)
 * @returns {string} - Encoded string: iv:encryptedData:authTag (hex)
 */
function encrypt(text, secretKey) {
  const key = Buffer.from(secretKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Store as colon-separated hex: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt AES-256-GCM encrypted string
 * @param {string} encryptedString - Format: iv:encryptedData:authTag (hex)
 * @param {string} secretKey - 64-char hex string (32 bytes)
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedString, secretKey) {
  const key = Buffer.from(secretKey, 'hex');
  const [ivHex, encryptedData, authTagHex] = encryptedString.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
