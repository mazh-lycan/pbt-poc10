import { chipFromText, textFromNdefRecord } from "./chip.js";

// Reads a chip key from a tag. Chrome on Android can read NFC. Everywhere
// else, the same key is read from a QR code with the camera.

// Call this from a button press. Chrome only shows the NFC permission prompt
// for a scan that starts in that tap.
export async function scanChip({ onStatus, onKey }) {
  if (!("NDEFReader" in window)) {
    onStatus("This browser cannot read NFC. Use the QR code on the piece.");
    return "unsupported";
  }
  onStatus("Hold the tag against the phone.");
  try {
    const reader = new window.NDEFReader();
    await reader.scan();
    reader.onreading = (event) => {
      for (const record of event.message.records) {
        const chip = chipFromText(textFromNdefRecord(record));
        if (chip) onKey(chip);
      }
    };
    reader.onreadingerror = () => onStatus("That tag could not be read. Try the QR code.");
    return "started";
  } catch (error) {
    if (error?.name === "NotAllowedError") {
      onStatus("NFC permission was denied. Press Scan NFC to allow it.");
      return "denied";
    }
    onStatus("NFC could not start. Press Scan NFC to try again.");
    return "denied";
  }
}

export async function scanQr({ elementId, onKey }) {
  const { Html5Qrcode } = await import(
    "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/esm/html5-qrcode.js"
  );
  const scanner = new Html5Qrcode(elementId);
  await scanner.start(
    { facingMode: "environment" },
    { fps: 8, qrbox: { width: 220, height: 220 } },
    (text) => {
      const chip = chipFromText(text);
      if (!chip) return;
      scanner.stop().catch(() => {});
      onKey(chip);
    },
  );
  return scanner;
}
