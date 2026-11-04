import { Wallet } from "ethers";

// Prints chip keys for .env and the addresses that belong in the ignition
// module. Nothing is written to disk: paste the first block into .env yourself.
const rawCount = process.argv[2] ?? "1";
const count = Number(rawCount);

if (!Number.isInteger(count) || count < 1 || count > 64) {
  console.error("Usage: node scripts/keygenerator.js [count]");
  console.error("count is a whole number from 1 to 64 (default 1).");
  process.exitCode = 1;
} else {
  const chips = Array.from({ length: count }, () => Wallet.createRandom());

  console.log("# paste into .env");
  chips.forEach((wallet, index) => {
    console.log(`CHIP_KEY_${index + 1}=${wallet.privateKey}`);
  });

  console.log("\n# paste into CHIP_ADDRESSES in ignition/modules/Season1byMazh.ts");
  chips.forEach((wallet) => {
    console.log(`  "${wallet.address}",`);
  });
}
