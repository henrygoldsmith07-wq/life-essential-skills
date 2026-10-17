/* Passphrase-encrypted evidence backup. No dependencies, no network.
 *
 * A plaintext evidence file on a shared computer, in an inbox, or on a USB
 * stick is readable by anyone who opens it. This module wraps the same JSON
 * in an AES-GCM-256 envelope whose key comes from PBKDF2-SHA256 and a caller
 * supplied passphrase, so a learner can move evidence between browsers or
 * keep an off-device copy without trusting the storage or the channel.
 *
 * The envelope carries its own KDF parameters (salt, iterations) and the
 * GCM nonce, all base64. A wrong passphrase fails GCM authentication and is
 * reported as one indistinguishable error — never as a padding/format hint.
 * The module never stores, logs, or transmits the passphrase or the key.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CryptoBackup=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const FORMAT = 'les-encrypted-backup';
  const VERSION = 1;
  const ITERATIONS = 210000;
  const MIN_PASSPHRASE_LENGTH = 8;

  const subtle = () => {
    const crypto = globalThis.crypto;
    if(!crypto||!crypto.subtle||!crypto.getRandomValues)throw new Error('Encrypted backup needs WebCrypto, which this browser does not provide.');
    return crypto.subtle;
  };

  const bytesToB64 = (bytes) => {
    let binary = '';
    for(const b of bytes)binary += String.fromCharCode(b);
    if(typeof btoa === 'function')return btoa(binary);
    return Buffer.from(binary, 'binary').toString('base64');
  };
  const b64ToBytes = (text) => {
    let binary;
    if(typeof atob === 'function')binary = atob(text);
    else binary = Buffer.from(text, 'base64').toString('binary');
    const out = new Uint8Array(binary.length);
    for(let n = 0; n < binary.length; n++)out[n] = binary.charCodeAt(n);
    return out;
  };

  async function keyFrom(passphrase, salt) {
    const enc = new TextEncoder().encode(passphrase);
    const base = await subtle().importKey('raw', enc, 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  function checkPassphrase(passphrase) {
    if(typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new Error('Use a passphrase of at least ' + MIN_PASSPHRASE_LENGTH + ' characters.');
    }
  }

  async function encryptJson(plaintext, passphrase) {
    if(typeof plaintext !== 'string' || !plaintext)throw new Error('Nothing to encrypt.');
    checkPassphrase(passphrase);
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFrom(passphrase, salt);
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    return {
      format: FORMAT, version: VERSION,
      kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: bytesToB64(salt) },
      enc: { name: 'AES-GCM-256', iv: bytesToB64(iv) },
      data: bytesToB64(new Uint8Array(data)),
    };
  }

  async function decryptJson(envelope, passphrase) {
    try {
      // Passphrase shape is the caller's own input, so its length error stays
      // specific; everything about the file afterwards is one opaque error.
      checkPassphrase(passphrase);
      const doc = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
      if(!doc || doc.format !== FORMAT || doc.version !== VERSION ||
        !doc.kdf || doc.kdf.iterations !== ITERATIONS ||
        typeof doc.kdf.salt !== 'string' || typeof doc.enc?.iv !== 'string' ||
        typeof doc.data !== 'string')throw new Error('bad envelope');
      checkPassphrase(passphrase);
      const key = await keyFrom(passphrase, b64ToBytes(doc.kdf.salt));
      const plain = await subtle().decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(doc.enc.iv) }, key, b64ToBytes(doc.data));
      return new TextDecoder().decode(plain);
    } catch(e) {
      if(e && /passphrase of at least|WebCrypto/.test(e.message))throw e;
      throw new Error('Wrong passphrase or damaged file.');
    }
  }

  function isEncryptedEnvelope(value) {
    try {
      const doc = typeof value === 'string' ? JSON.parse(value) : value;
      return !!doc && doc.format === FORMAT && doc.version === VERSION;
    } catch { return false; }
  }

  return { FORMAT, VERSION, ITERATIONS, MIN_PASSPHRASE_LENGTH, encryptJson, decryptJson, isEncryptedEnvelope };
});
