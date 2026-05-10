import crypto from 'crypto';

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export async function staffRoutes(fastify, { pool }) {
  fastify.get('/staff/available-pins', async () => {
    // Requirement: generate PINs that do NOT already exist in the staff table,
    // including inactive/soft-deleted records. In this codebase the staff identity
    // lives in `users` and the persisted PIN is `pin_hash`.
    const r = await pool.query('select pin_hash from users');
    const usedPinHashes = new Set(r.rows.map((row) => row.pin_hash));

    const generatedPins = new Set();
    const availablePins = [];

    // Keep generating until we have 4 suggestions.
    // Use a reasonable upper bound to avoid infinite loops in edge cases.
    const maxAttempts = 50000;
    let attempts = 0;

    while (availablePins.length < 4 && attempts < maxAttempts) {
      attempts += 1;
      const candidate = Math.floor(Math.random() * 9000) + 1000; // 1000–9999

      // Avoid duplicates inside suggestions themselves.
      if (generatedPins.has(candidate)) continue;
      generatedPins.add(candidate);

      const candidateHash = sha256Hex(candidate);
      if (usedPinHashes.has(candidateHash)) continue;

      availablePins.push(candidate);
    }

    if (availablePins.length < 4) {
      // Frontend will fail silently; server should still return a useful error.
      throw new Error(`Unable to generate 4 available PINs after ${attempts} attempts.`);
    }

    return { availablePins };
  });
}

