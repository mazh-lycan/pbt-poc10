import { existsSync, readFileSync } from "node:fs";

import { Wallet, getAddress } from "ethers";

// Chip private keys live in .env (see .env.example). The ignition module lists
// only the derived addresses. A wrong address still deploys, and updateChip can
// repair it later, but the owner has to notice. Run this before every deploy.

const ENV_FILE = ".env";
const MODULE_FILE = "ignition/modules/Season1byMazh.ts";
const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function loadEnv(file) {
  if (!existsSync(file)) {
    console.error(
      `Missing ${file}. Copy .env.example to ${file} and fill CHIP_KEY_1 onward.`,
    );
    return false;
  }

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const name = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A variable already set in the shell wins over the file.
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }

  return true;
}

function chipKeysFromEnv() {
  const present = [];

  for (const [name, value] of Object.entries(process.env)) {
    const match = /^CHIP_KEY_(\d+)$/.exec(name);
    if (match === null) continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    present.push({ index: Number(match[1]), value: trimmed });
  }

  present.sort((a, b) => a.index - b.index);

  const errors = [];
  present.forEach((entry, position) => {
    const expected = position + 1;
    if (entry.index !== expected) {
      errors.push(
        `CHIP_KEY_${expected} is missing and CHIP_KEY_${entry.index} is set. Number the keys from 1 with no gaps.`,
      );
    }
    if (!KEY_PATTERN.test(entry.value)) {
      errors.push(`CHIP_KEY_${entry.index} is not a 32-byte hex private key.`);
    }
  });

  return { keys: present.map((entry) => entry.value), errors };
}

function normalise(address) {
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

if (!loadEnv(ENV_FILE)) {
  process.exitCode = 1;
} else {
  const { keys, errors } = chipKeysFromEnv();
  const listed = [
    ...readFileSync(MODULE_FILE, "utf8").matchAll(/"(0x[0-9a-fA-F]{40})"/g),
  ].map((match) => match[1]);

  let ok = errors.length === 0 && listed.length > 0 && listed.length === keys.length;

  if (listed.length !== keys.length) {
    errors.push(
      `The module lists ${listed.length} addresses and .env holds ${keys.length} chip keys. The counts have to match, in order.`,
    );
  }

  for (const error of errors) {
    console.error(error);
  }

  const seen = new Set();

  listed.forEach((address, index) => {
    const key = keys[index];
    const derived =
      key !== undefined && KEY_PATTERN.test(key) ? new Wallet(key).address : null;
    const normalised = normalise(address);
    const matches = derived !== null && normalised === derived;
    const duplicate = derived !== null && seen.has(derived);

    if (derived !== null) seen.add(derived);
    if (!matches || duplicate) ok = false;

    const detail = matches
      ? duplicate
        ? "  duplicate address"
        : ""
      : `  key derives ${derived ?? "nothing usable"}`;

    console.log(
      `${matches && !duplicate ? "ok      " : "MISMATCH"} token ${index + 1}  ${address}${detail}`,
    );
  });

  if (ok) {
    console.log(`\nAll ${listed.length} chips pair correctly.`);
  } else {
    console.error("\nDO NOT DEPLOY: the module does not match .env.");
    process.exitCode = 1;
  }
}
