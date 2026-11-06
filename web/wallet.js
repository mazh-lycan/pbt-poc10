import { BrowserProvider } from "./ethers.js";
import { config } from "./config.js";

let account = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(account);
}

export function onAccount(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAccount() {
  return account;
}

export function short(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function chainIdHex() {
  return `0x${config.chainId.toString(16)}`;
}

function getEthereum() {
  const ethereum = window.ethereum;
  if (ethereum === undefined) return undefined;
  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers.find((provider) => provider.isMetaMask) ?? ethereum.providers[0];
  }
  return ethereum;
}

function waitForEthereum(ms = 800) {
  const existing = getEthereum();
  if (existing !== undefined) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener("ethereum#initialized", finish);
      clearTimeout(timer);
      resolve(getEthereum());
    };
    const timer = setTimeout(finish, ms);
    window.addEventListener("ethereum#initialized", finish);
  });
}

// The chip key is never copied onto this link. MetaMask flags a private key
// in the address as a malicious site.
export function metamaskDappUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("k");
  const hash = url.hash.replace(/^#/, "");
  if (hash.startsWith("k=") || hash.includes("&k=")) url.hash = "#/";
  return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}${url.hash}`;
}

export function forgetKeyInAddress() {
  const url = new URL(window.location.href);
  const hadQueryKey = url.searchParams.has("k");
  url.searchParams.delete("k");
  const hash = url.hash.replace(/^#/, "");
  const hadHashKey = hash.startsWith("k=") || hash.includes("&k=");
  if (hadHashKey) url.hash = "#/";
  if (hadQueryKey || hadHashKey) {
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function ensureChain(ethereum) {
  const wanted = chainIdHex();
  const current = await ethereum.request({ method: "eth_chainId" });
  if (BigInt(current) === BigInt(wanted)) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: wanted }],
    });
  } catch (error) {
    const code = error?.code ?? error?.error?.code;
    if (code !== 4902 && code !== -32603) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: wanted,
          chainName: config.chainName,
          rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: [config.explorerUrl],
        },
      ],
    });
  }
}

export async function connectWallet() {
  const ethereum = await waitForEthereum();
  if (ethereum === undefined) {
    window.location.href = metamaskDappUrl();
    return null;
  }

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("No account selected in MetaMask.");
  }
  await ensureChain(ethereum);
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner(accounts[0]);
  account = await signer.getAddress();

  ethereum.removeAllListeners?.("accountsChanged");
  ethereum.removeAllListeners?.("chainChanged");
  ethereum.on?.("accountsChanged", () => {
    account = null;
    emit();
  });
  ethereum.on?.("chainChanged", () => {
    account = null;
    emit();
  });
  emit();
  return account;
}

export async function signerFor(contractFactory) {
  const ethereum = getEthereum();
  if (!ethereum || !account) return null;
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner(account);
  return contractFactory(signer);
}
