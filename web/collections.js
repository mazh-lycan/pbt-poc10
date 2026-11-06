import { config } from "./config.js";

// One entry per season. A later season is another object here with its own
// contract address and token ids. Blue Wolves has no contract yet.
const LIL_GUYS_IMAGE =
  "bafybeihreyaqyevk2triea7mfzut6gbzuxgpaiwvzmyoxo73be3it37ncq/1.png";

export const collections = [
  {
    id: "lil-guys",
    name: "Lil Guys",
    contractAddress: config.contractAddress,
    tokenIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    banner: config.ipfsGateway + LIL_GUYS_IMAGE,
  },
  {
    id: "blue-wolves",
    name: "Blue Wolves",
    contractAddress: null,
    tokenIds: [],
    banner: "./blue-wolves.svg",
  },
];

export function collectionById(id) {
  return collections.find((collection) => collection.id === id) ?? null;
}

export function collectionsWithContract() {
  return collections.filter((collection) => collection.contractAddress);
}
