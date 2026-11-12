import { Wallet, getBytes } from "./ethers.js";

// A tag or QR code carries the chip private key and nothing else.
// The key stays in memory for the claim. It is never written into the URL.
const KEY = /(?:0x)?([0-9a-fA-F]{64})/;

export function chipFromText(text) {
  const raw = String(text ?? "");
  const match = KEY.exec(raw) ?? KEY.exec(raw.replace(/\s+/g, ""));
  if (!match) return null;

  try {
    const wallet = new Wallet(`0x${match[1]}`);
    return {
      address: wallet.address,
      signDigest(digest) {
        return wallet.signMessage(getBytes(digest));
      },
    };
  } catch {
    return null;
  }
}

function payloadBytes(record) {
  const data = record.data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function decode(bytes, encoding) {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return "";
  }
}

// A tag may store the key as plain text or inside the old page URL.
// Text records can be UTF-8 or UTF-16, and the first byte is a language header.
export function textsFromNdefRecord(record) {
  const bytes = payloadBytes(record);
  const texts = [];
  const add = (encoding, slice) => texts.push(decode(slice, encoding));

  if (record.recordType === "text" && bytes.length > 0) {
    const status = bytes[0];
    const languageLength = status & 0x3f;
    const encoded = bytes.subarray(Math.min(bytes.length, 1 + languageLength));
    add(status & 0x80 ? "utf-16be" : "utf-8", encoded);
    add("utf-8", bytes);
    add("utf-16be", bytes);
    add("utf-16le", bytes);
    return texts;
  }

  if (record.recordType === "url" && bytes.length > 0) {
    add("utf-8", bytes.subarray(1));
    add("utf-8", bytes);
    return texts;
  }

  add("utf-8", bytes);
  add("utf-16be", bytes);
  add("utf-16le", bytes);
  return texts;
}

export function textFromNdefRecord(record) {
  return textsFromNdefRecord(record)[0] ?? "";
}
