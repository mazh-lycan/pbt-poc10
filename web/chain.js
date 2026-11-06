import { SEASON_ABI } from "./abi.js";
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  keccak256,
} from "./ethers.js";
import { config } from "./config.js";
import { collectionById, collectionsWithContract } from "./collections.js";

const NO_EXTRAS = "0x";

const readProvider = new JsonRpcProvider(config.rpcUrl, config.chainId);
const readers = new Map();
const metadataSupport = new Map();
const baseUris = new Map();

// A public RPC answers a burst of calls with HTTP 400. Keep the season grid
// to a couple of reads at a time.
let readsInFlight = 0;
const readQueue = [];
const READ_LIMIT = 2;

function paced(task) {
  const run = () => {
    readsInFlight += 1;
    return Promise.resolve()
      .then(task)
      .finally(() => {
        readsInFlight -= 1;
        const next = readQueue.shift();
        if (next) next();
      });
  };
  if (readsInFlight < READ_LIMIT) return run();
  return new Promise((resolve, reject) => {
    readQueue.push(() => run().then(resolve, reject));
  });
}

function reader(address) {
  let contract = readers.get(address);
  if (!contract) {
    contract = new Contract(address, SEASON_ABI, readProvider);
    readers.set(address, contract);
  }
  return contract;
}

export function gatewayUrl(uri) {
  if (!uri) return config.placeholderImage;
  return uri.startsWith("ipfs://")
    ? config.ipfsGateway + uri.slice("ipfs://".length)
    : uri;
}

async function cachedBaseUri(contract) {
  const address = (await contract.getAddress()).toLowerCase();
  if (!baseUris.has(address)) baseUris.set(address, contract.baseURI());
  return baseUris.get(address);
}

// The season already on Arbitrum Sepolia has no metadataURI. Probe once so a
// collection grid does not fire a failing call for every piece.
async function hasMetadataUri(contract) {
  const address = (await contract.getAddress()).toLowerCase();
  if (!metadataSupport.has(address)) {
    const probe = contract
      .metadataURI(1)
      .then(() => true)
      .catch(() => false);
    metadataSupport.set(address, probe);
  }
  return metadataSupport.get(address);
}

export async function metadataUri(contract, tokenId) {
  if (await hasMetadataUri(contract)) return contract.metadataURI(tokenId);
  const base = await cachedBaseUri(contract);
  return `${base}${tokenId}`;
}

export async function loadMetadata(contract, tokenId) {
  const uri = await paced(() => metadataUri(contract, tokenId));
  const response = await fetch(gatewayUrl(uri));
  if (!response.ok) throw new Error(`metadata ${response.status}`);
  const metadata = await response.json();
  return {
    name: metadata.name ?? `#${tokenId}`,
    description: metadata.description ?? "",
    image: gatewayUrl(metadata.image),
  };
}

function unclaimed(error) {
  const text = `${error?.reason ?? ""} ${error?.shortMessage ?? ""} ${error?.message ?? ""}`;
  return text.includes("invalid token ID");
}

export async function ownerOf(contract, tokenId) {
  try {
    return await paced(() => contract.ownerOf(tokenId));
  } catch (error) {
    if (unclaimed(error)) return null;
    throw error;
  }
}

export async function loadPiece(collection, tokenId) {
  const contract = reader(collection.contractAddress);
  const [metadata, holder] = await Promise.all([
    loadMetadata(contract, tokenId),
    ownerOf(contract, tokenId),
  ]);
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    tokenId,
    holder,
    ...metadata,
  };
}

export async function loadCollection(collection) {
  return Promise.all(
    collection.tokenIds.map((tokenId) => loadPiece(collection, tokenId)),
  );
}

export async function piecesOwnedBy(address) {
  const owned = [];
  for (const collection of collectionsWithContract()) {
    const pieces = await loadCollection(collection);
    for (const piece of pieces) {
      if (piece.holder && piece.holder.toLowerCase() === address.toLowerCase()) {
        owned.push(piece);
      }
    }
  }
  return owned;
}

export async function pieceForChip(chip) {
  for (const collection of collectionsWithContract()) {
    const contract = reader(collection.contractAddress);
    try {
      const tokenId = Number(await contract.tokenIdFor(chip.address));
      return loadPiece(collection, tokenId);
    } catch {
      // This chip belongs to another season, or to none.
    }
  }
  return null;
}

async function claimTxOverrides(provider) {
  const [feeData, block] = await Promise.all([
    provider.getFeeData(),
    provider.getBlock("latest"),
  ]);
  const baseFee = block.baseFeePerGas ?? 0n;
  const suggested = feeData.maxFeePerGas ?? baseFee;
  const maxFeePerGas =
    (suggested > baseFee ? suggested : baseFee) * 2n + 10_000_000n;
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas;
  return { maxFeePerGas, maxPriorityFeePerGas, block };
}

export async function claimPiece({ signerContract, chip, to, holder }) {
  const provider = signerContract.runner.provider;
  const nonce = await signerContract.chipNonce(chip.address);
  const fee = await claimTxOverrides(provider);
  const signatureTimestamp = BigInt(fee.block.timestamp) - 15n;
  const network = await provider.getNetwork();
  const digest = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes32", "address", "uint256", "bytes32"],
      [
        await signerContract.getAddress(),
        network.chainId,
        nonce,
        to,
        signatureTimestamp,
        keccak256(NO_EXTRAS),
      ],
    ),
  );
  const signature = await chip.signDigest(digest);
  const args = holder
    ? [to, chip.address, signature, signatureTimestamp, false, NO_EXTRAS]
    : [to, chip.address, signature, signatureTimestamp, NO_EXTRAS];
  const method = holder ? "transferToken" : "mint";
  const txOverrides = {
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
  };

  await signerContract[method].staticCall(...args);
  try {
    const estimated = await signerContract[method].estimateGas(...args);
    txOverrides.gasLimit = (estimated * 130n) / 100n;
  } catch {
    txOverrides.gasLimit = 500_000n;
  }

  const transaction = await signerContract[method](...args, txOverrides);
  await transaction.wait();
}

export function contractFor(collectionId, signer) {
  const collection = collectionById(collectionId);
  if (!collection?.contractAddress) return null;
  return new Contract(collection.contractAddress, SEASON_ABI, signer ?? readProvider);
}

export function describeError(error) {
  const nested =
    error?.info?.error?.message ??
    error?.shortMessage ??
    error?.reason ??
    error?.message;
  if (typeof nested === "string" && nested.length > 0 && nested !== "could not coalesce error") {
    return nested;
  }
  return "Something went wrong.";
}
