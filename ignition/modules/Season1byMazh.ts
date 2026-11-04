import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Public addresses derived from CHIP_KEY_1 onward in .env. The keys stay out of
// git. Order is the pairing: the first address is token 1. updateChip can
// repair a bad pair after deployment, but check them first with
// `node scripts/verify-chips.js`. These three are the trial-run chips.
const CHIP_ADDRESSES: string[] = [
  "0x03798f947511e91917cb3a27B172aE2D190D5dD6",
  "0xEFFf1C1fA18BEA31ca8262010687e68391DD2bff",
  "0x0C99149420d9134CC802aE0B303D6258870B84c5",
  "0xb90639E7AFb6bB2AeC40511D1BDb4B269ad3a459",
  "0x10472717EAEc4a0a23a288707003a8645BE54313",
  "0xB48ADFa7F2181e4b3F913A87Ee087E43eF0A503a",
  "0xdAD0138C1eB067a011B558116670d11CeE9a35c7",
  "0x73BA268520fcdF25F93152aa30c9B31f4FA57F8b",
  "0x1B3b6089dA8013F98E2A7a9874E83ed6dd654e0e",
  "0x2311d82DE2136A3920f132D8463DA927098c3821"
];

// Positional: CHIP_KEY_1 is paired to token 1, and token 1 resolves to the
// metadata file named `1`. Zero is not allowed, it is what an unpaired chip
// maps to. The next deploy replaces this list with the ten new keys.
const TOKEN_IDS: bigint[] = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];


// One hour. The chip signs at the moment the claim button is pressed, so this
// only has to cover the gap until the transaction is mined, but a generous
// window means a collector fumbling with MetaMask in front of an audience does
// not watch the signature expire.
const MAX_DURATION_WINDOW: bigint = 3600n;

export default buildModule("Season1byMazh", (m) => {
  const chipAddresses = m.getParameter("chipAddresses", CHIP_ADDRESSES);
  const tokenIds = m.getParameter("tokenIds", TOKEN_IDS);
  const maxDurationWindow = m.getParameter(
    "maxDurationWindow",
    MAX_DURATION_WINDOW,
  );

  // Deliberately without a default. The metadata CID does not exist until the
  // folder is pinned, and deploying a placeholder by accident costs an owner
  // transaction to undo.
  const baseURI = m.getParameter("baseURI");

  const season = m.contract("Season1byMazh", [
    chipAddresses,
    tokenIds,
    maxDurationWindow,
    baseURI,
  ]);

  return { season };
});
