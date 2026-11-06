import { Wallet, getBytes } from "./ethers.js";

// A tag or QR code carries the chip private key and nothing else.
// The key stays in memory for the claim. It is never written into the URL.
const KEY = /(?:0x)?([0-9a-fA-F]{64})/;

export function chipFromText(text) {
  const match = KEY.exec(String(text ?? ""));
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

export function textFromNdefRecord(record) {
  const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
  if (record.recordType === "text") {
    const languageLength = bytes[0] & 0x3f;
    return new TextDecoder().decode(bytes.slice(1 + languageLength));
  }
  return new TextDecoder().decode(bytes);
}
