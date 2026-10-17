// Round-trip and adversarial tests for the encrypted evidence backup.
// Runs in Node (WebCrypto is global since Node 19); the same module ships
// to the browser unchanged.
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CryptoBackup = require('../learner/crypto-backup.js');

const SAMPLE = JSON.stringify({ schema_version: 2, records: [{ id: 'r-1' }], reviews: [], observations: [], legacy_observations: [], exposures: [] });
const PASS = 'correct horse battery staple';

describe('encrypted backup', () => {
  it('round-trips evidence through encrypt and decrypt', async () => {
    const envelope = await CryptoBackup.encryptJson(SAMPLE, PASS);
    assert.equal(envelope.format, 'les-encrypted-backup');
    assert.equal(envelope.version, 1);
    assert.equal(typeof envelope.data, 'string');
    assert.equal(await CryptoBackup.decryptJson(envelope, PASS), SAMPLE);
    assert.equal(await CryptoBackup.decryptJson(JSON.stringify(envelope), PASS), SAMPLE);
  });

  it('produces fresh salt and nonce every time', async () => {
    const a = await CryptoBackup.encryptJson(SAMPLE, PASS);
    const b = await CryptoBackup.encryptJson(SAMPLE, PASS);
    assert.notEqual(a.data, b.data);
    assert.notEqual(a.kdf.salt, b.kdf.salt);
    assert.notEqual(a.enc.iv, b.enc.iv);
  });

  it('ciphertext reveals nothing without the passphrase', async () => {
    const envelope = await CryptoBackup.encryptJson(SAMPLE, PASS);
    const blob = JSON.stringify(envelope);
    assert.ok(!blob.includes('r-1') && !blob.includes('schema_version'));
  });

  it('rejects a wrong passphrase with one indistinguishable error', async () => {
    const envelope = await CryptoBackup.encryptJson(SAMPLE, PASS);
    await assert.rejects(CryptoBackup.decryptJson(envelope, 'wrong horse battery staple'),
      /Wrong passphrase or damaged file\./);
  });

  it('rejects tampered ciphertext, salt and nonce alike', async () => {
    const envelope = await CryptoBackup.encryptJson(SAMPLE, PASS);
    const flip = (b64) => b64.slice(0, -2) + (b64.slice(-2) === 'AA' ? 'BB' : 'AA');
    for (const tampered of [
      { ...envelope, data: flip(envelope.data) },
      { ...envelope, kdf: { ...envelope.kdf, salt: flip(envelope.kdf.salt) } },
      { ...envelope, enc: { ...envelope.enc, iv: flip(envelope.enc.iv) } },
    ]) {
      await assert.rejects(CryptoBackup.decryptJson(tampered, PASS), /Wrong passphrase or damaged file\./);
    }
  });

  it('refuses short passphrases and empty input before touching crypto', async () => {
    await assert.rejects(CryptoBackup.encryptJson(SAMPLE, 'short'), /at least 8 characters/);
    await assert.rejects(CryptoBackup.encryptJson('', PASS), /Nothing to encrypt/);
    await assert.rejects(CryptoBackup.decryptJson({ format: 'les-encrypted-backup', version: 1 }, 'short'), /at least 8 characters/);
  });

  it('detects its own envelopes and ignores plaintext', async () => {
    const envelope = await CryptoBackup.encryptJson(SAMPLE, PASS);
    assert.equal(CryptoBackup.isEncryptedEnvelope(envelope), true);
    assert.equal(CryptoBackup.isEncryptedEnvelope(JSON.stringify(envelope)), true);
    assert.equal(CryptoBackup.isEncryptedEnvelope(SAMPLE), false);
    assert.equal(CryptoBackup.isEncryptedEnvelope('not json'), false);
  });
});
