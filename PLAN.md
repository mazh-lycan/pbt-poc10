# Season 1 by Mazh

Working notes for the physical-backed token proof of concept, compiled from the project docs and the code as it stands, plus the run to execute next.
 
The contract is `Season1byMazh`. Each physical piece carries an NFC tag. The tag holds a site URL whose fragment contains that piece's private key. The page signs a fresh challenge with the key, and the contract mints the paired token or transfers it. Metadata lives on IPFS. The site is `web/`.

## What is already live

Phase 1, the three-piece trial, is deployed on Arbitrum Sepolia (chain id `421614`).

| | |
|---|---|
| Contract | `0x74C88f46fC08248c02bbb02ccDD2574310a45e8E` |
| Explorer | `https://sepolia.arbiscan.io` |
| Chips in that deploy | tokens 1–3 |
| Metadata | `ipfs://bafybeif2nwzgz4frjhyau5o6jyeb6ah4m5agbp4rfrfvyx5ucelz77p35u/` |
| Images | `ipfs://bafybeihtlvupuxnq4557dquddkckvkpywgubvzb6mfli6gknjivwafgrqu/{1,2,3}.jpg` |
| Site config | `web/config.js` points at that contract |
| Pages URL | `https://mazh-lycan.github.io/pbt-poc10/web/` |

`ipfs/3tests/` holds the three metadata files. Character traits are still `TBD`. The ignition module still lists those three trial addresses. Treat that deployment as the throwaway trial. The next run deploys a new contract.

`updateChip`, `removeChip`, and `setBaseURI` are already on the contract and covered by `test/Season1byMazhTest.ts`.

## How a scan works

The tag stores one URI record:

```
https://mazh-lycan.github.io/pbt-poc10/web/#k=<that chip's private key>
```

The key belongs in the fragment (`#k=`). A fragment stays in the browser: it is not sent to the server, and it does not land in access logs, `Referer` headers, or analytics. `web/chip.js` is the only module that reads the key. Everything else asks it for `address` and `signDigest`. A query-string `?k=` is rewritten back into the fragment, because MetaMask's in-app browser often drops the hash on the way in.

`signDigest` is the migration seam. A real Arx Halo or Kong chip generates its key on-die and signs a challenge over NFC, so the key never leaves the chip. This proof of concept does the opposite: the first person who scans a tag can save the key and move the token later without the object. That is acceptable for the demo. Replacing `web/chip.js` with a libhalo-backed signer is the whole migration when a real chip replaces the URL key.

Verification does not need a wallet. `isChipSignatureForToken` is a view. The page builds a new random challenge on each attempt, so a green result is a live signature and not a replay of a fixed string. The digest construction to keep is `signAsChip` in `test/Season1byMazhTest.ts`: read `chipNonce`, ABI-encode the fields, hash, and sign EIP-191.

A green check proves the tag holds the key for that token. It does not prove the page is honest. A counterfeit tag can point at a lookalike site that always shows green. The practical answer is social: people learn one domain.

The page branches on mint state. `ownerOf` reverts while a token is unminted, so that revert means "unclaimed": show `web/placeholder.svg`, then `mint`. Every later claim is `transferToken`.

On a phone, a normal browser has no `window.ethereum`. NFC opens that browser. Connect deep-links into MetaMask's in-app browser via `https://metamask.app.link/dapp/...`, carrying the key so it survives the hop. Deep-link behaviour differs between Android and iOS, and it still needs a pass on the actual phone. If it misbehaves, the fallback is WalletConnect, which is a larger change than anything else in this run. The chain id sent to MetaMask is unpadded (`421614` → `0x66eee`). A leading zero is rejected by MetaMask mobile.

## Metadata

`tokenURI` is `baseURI` plus the token id, from OpenZeppelin's default. The constructor stores `baseURI`, `_baseURI()` returns it, and `setBaseURI` lets the owner repoint it. `renounceOwnership` reverts, so the contract cannot end up with nobody able to repoint metadata.

The directory CID needs a trailing slash. `ipfs://<CID>/1` is file `1` inside the folder. `ipfs://<CID>1` is a different path. Metadata files are named `1` … `10` with no extension. Each `image` field points at `ipfs://<IMAGE_CID>/<n>.jpg` (or `.png`, as long as the filename matches the uploaded file). Images are pinned first, because the metadata cites their CID.

Browsers cannot fetch `ipfs://` on their own. `web/config.js` rewrites through the public Pinata gateway. A dedicated gateway goes in gitignored `web/config.local.js`, copied from `web/config.local.example.js`. Pinata's free plan covers this proof of concept: 1 GB storage, 500 files, one dedicated gateway, 10 GB bandwidth, 10,000 gateway requests a month.

Current trial files use placeholder names (`Season1byMazh #1`) and `Character: TBD`. The ten-file set should carry the real name, description, and attributes.

## Keys

Chip private keys live in `.env` as `CHIP_KEY_1` … `CHIP_KEY_10`. `CHIP_KEY_1` pairs with token 1. `.env` is gitignored. `.env.example` is the empty template and is safe to commit. `chips.md` is retired; the ignore rule remains so an old copy cannot be committed by accident.

```bash
node scripts/keygenerator.js 10
```

That prints a `.env` block and the address list. Paste the keys into `.env`. Paste the addresses into `CHIP_ADDRESSES` in `ignition/modules/Season1byMazh.ts`, with `TOKEN_IDS` of `1n` through `10n`. Then:

```bash
node scripts/verify-chips.js
```

The script derives each address from `.env` and compares it to the module, in order. Counts must match, numbering must start at 1 with no gaps, and duplicate addresses fail the check. The module commits only addresses. Addresses are public. The keys are not.

The deployer key is separate from the chip keys. `hardhat.config.ts` reads it through Hardhat's keystore:

```bash
npx hardhat keystore set ARBITRUM_SEPOLIA_RPC_URL
npx hardhat keystore set ARBITRUM_SEPOLIA_PRIVATE_KEY
```

The deployer becomes the owner, and the owner is the only account that can call `setBaseURI`, `updateChip`, and `removeChip`. Use a key you will still have later. There is also an Ethereum Sepolia network entry (`SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`). This run uses `arbitrumSepolia`.

## Chip replacement

Pairing is two mappings. `_chipIds[tokenId]` says which chip the token wears. `_tokenIds[chip]` says which token a chip claims to be.

`updateChip(tokenId, newChip)` points the token at the new chip and points the new chip at the token. It leaves the old chip's reverse mapping in place. After a swap, the peeled tag still "remembers" the token id.

`PBTSimple`'s mint check only asks whether the token has some chip assigned. Without a further check, the old key could still mint that token until someone claimed it, and the piece would have two physical keys. Transfers were already strict: `tokenIdFor` asks whether this chip is still the one glued to that token.

`Season1byMazh._beforeMint` asks the same question before mint:

```99:103:contracts/Season1byMazh.sol
    ) internal override returns (uint256 tokenId) {
        tokenId = super._beforeMint(to, chipId, chipSignature, signatureTimestamp, extras);
        if (_chipIds[tokenId] != chipId) revert WrongTokenForChip();
    }
```

In the story used while writing that check: token 2 (Blaze) loses its tag, the owner calls `updateChip(2, newChip)`, and a scan of the old tag reverts. Tokens 1 and 3 are untouched. The check matters in the window after a restick and before the first claim. Once the token is minted, the library path already blocks the old tag on transfer. `removeChip` clears a pair. Both functions are `onlyOwner`. Token id 0 is rejected, because 0 means "unpaired".

## Claim gas

`claimTxOverrides` in `web/app.js` sets `maxFeePerGas` to twice the current base fee plus `10_000_000` wei. Arbitrum Sepolia was rejecting MetaMask's estimate with `max fee per gas less than block base fee` (for example `258724000` against `260594000`). The same showed up on a plain ETH transfer until the fee was bumped by hand. On the next chain, check whether this buffer is still required. A mainnet with a steadier base fee can use MetaMask's own estimate.

The signature window is one hour (`3600`). The chip signs when the claim button is pressed. The window covers fumbling with MetaMask in front of an audience.

## Payments, later

Keep the free chip transfer as the always-available path. Pieces get gifted, inherited, traded at a table, or moved between a gallery and a warehouse. A mandatory on-chain payment means people hand over the object and leave the token behind. The provenance record goes stale, and a stale record is what made a royalty worth having.

Two paths can share the same chip signature:

- Path A is what the contract does now. Scan, transfer, no price.
- Path B is a later payable settlement. The buyer pays, the contract splits a creator royalty and forwards the rest to the seller, the token moves, and a `Sale` event records price and parties. The buyer cannot pay without receiving, and the seller cannot be paid without releasing.

Path B is an incentive, because Path A stays open. Reasons to choose it: an on-chain price for insurance and the next resale, creator perks tied to a registered sale, and a history that distinguishes a verified sale from an unrecorded transfer.

Three layers sit under that, and they are separate decisions:

- Wallet. An embedded wallet (email or passkey: Privy, Dynamic, Coinbase Smart Wallet) plus an ERC-4337 paymaster means a buyer never sees a seed phrase and never needs ETH for gas.
- Money in. An on-ramp (Stripe crypto on-ramp, Coinbase Onramp, MoonPay, Transak) turns a card payment into USDC. USDC has EIP-2612 permit, so approve and pay can be one signature. KYC sits on the provider.
- Money out. The seller holds USDC and needs an off-ramp to reach a bank. This is the layer that hurts a collector selling a piece for a few hundred euro.

Taking fiat yourself and settling from a backend makes the shop feel ordinary and pays the seller by bank transfer. The on-chain price becomes your attestation, and handling other people's resale money is money-transmitter territory. Decide that before building Path B. The current answer is to leave it.

ERC-2981 is cheap to add as a signal and does nothing by itself here: `transferFrom` reverts, so an external marketplace cannot sell these tokens. Any royalty has to live in your own settlement function.

When Path B is built, the chip is in the seller's hands at handover, so the chip signature is the seller's consent. Put price and split in `extras`, and those terms are part of what was signed. Also decide the case where the on-chain owner and the person holding the object have diverged, because paying `ownerOf` would send the money to someone who no longer has the piece.

Run Path A with real people scanning real tags before designing Path B.

## Where the trial left off

Done: URI logic, three metadata files, local tests, the site, Pinata gateway rewriting, the ignition module, three trial chips on Arbitrum Sepolia, `web/config.js` filled for that deploy, GitHub Pages, chip swap functions and the mint check.

Still open from the original phase-2 list, and changed by this run: the art, the IPFS folders, and the contract are done again from scratch for ten pieces, with ten new keys. The old "keep tags 1–3" note applied when the same three keys were reused. New keys mean all ten tags are rewritten.

After this run, the later work is Arbitrum One, an OpenSea check, and only then the payment path above. Testnets do not show on OpenSea proper. `https://testnets.opensea.io` is the testnet look.

---

# Run to execute

Do these in order. Metadata cites the image CID, the module cites the keys, and the site cites the contract, so the order is the dependency order.

Confirm before starting that `git status` does not list `.env`. GitHub Pages on a free account publishes a public repo.

## 1. Ten new chip keys

```bash
cp .env.example .env
node scripts/keygenerator.js 10
```

Paste the `CHIP_KEY_*` lines into `.env`.

In `ignition/modules/Season1byMazh.ts`, replace `CHIP_ADDRESSES` with the ten printed addresses and set:

```ts
const TOKEN_IDS: bigint[] = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];
```

```bash
node scripts/verify-chips.js
```

Stop if that prints `DO NOT DEPLOY`.

These keys are new, so the three tags already written for the trial sign the old contract only. All ten tags get a new URI in step 7. Leave the tags writable. A later custom domain means rewriting every tag, and a locked tag cannot be rewritten.

## 2. Artwork and IPFS

Draw the ten pieces. Square, about 2000×2000. Name the files `1.jpg` … `10.jpg` to match the trial, or `1.png` … `10.png` if you switch. The metadata `image` filename has to be the name you upload.

Upload the **images folder** to Pinata as one folder. Record the directory CID as `IMAGE_CID`.

Write `ipfs/10tests/1` … `ipfs/10tests/10`, no extension, using `ipfs/3tests/1` as the shape. In each file set `name`, `description`, and `attributes`, and set `image` to `ipfs://<IMAGE_CID>/<n>.jpg`.

Upload the **metadata folder** as one folder. Record that directory CID as `METADATA_CID`.

Check in a browser:

```
https://gateway.pinata.cloud/ipfs/<METADATA_CID>/1
```

The response is JSON, and the `image` URL inside it renders.

Put the base URI in `ignition/parameters.json`. Keep the trailing slash.

```json
"baseURI": "ipfs://<METADATA_CID>/"
```

## 3. Test, then deploy

```bash
npx hardhat test
node scripts/verify-chips.js
```

Both need to pass.

Move the trial journal aside so Ignition does not resume `0x74C88f46fC08248c02bbb02ccDD2574310a45e8E`. Ignition treats the same module on chain `421614` as already deployed, and changed constructor arguments make it refuse to continue. The old contract stays on chain either way.

```bash
mv ignition/deployments/chain-421614 ignition/deployments/chain-421614-trial-3
```

Fund the deployer with Arbitrum Sepolia ETH. Then:

```bash
npx hardhat keystore set ARBITRUM_SEPOLIA_RPC_URL
npx hardhat keystore set ARBITRUM_SEPOLIA_PRIVATE_KEY
npx hardhat run scripts/check-deployer.ts --network arbitrumSepolia
npx hardhat ignition deploy ignition/modules/Season1byMazh.ts \
  --network arbitrumSepolia \
  --parameters ignition/parameters.json
```

Record the new address as `CONTRACT_ADDRESS`. On Arbiscan, `baseURI()` should be exactly `ipfs://<METADATA_CID>/`.

In `web/config.js` set `contractAddress` to `CONTRACT_ADDRESS`. Leave `chainId` at `421614`. Leave `ipfsGateway` on the public Pinata gateway unless you have filled `web/config.local.js` with a dedicated gateway. Leave `rpcUrl` on the public endpoint unless it rate-limits, in which case use an Alchemy or Infura Arbitrum Sepolia URL.

## 4. Publish

`git status` should not list `.env`, and `git check-ignore -v .env` should point at `.gitignore`. Then push `main`. Settings → Pages → deploy from branch `main`, folder `/ (root)`.

Open `https://mazh-lycan.github.io/pbt-poc10/web/` on a desktop browser with no `#k=` fragment. The page should say to scan a Season 1 tag.

## 5. Tags and smoke test

Write one URI record per tag, each with its own key from `.env`:

```
https://mazh-lycan.github.io/pbt-poc10/web/#k=<CHIP_KEY_n>
```

Then, in this order:

1. Tap tag 1. The page shows `#1`, unclaimed, placeholder image.
2. Press "Verify this piece". Green, no wallet.
3. Connect. On a phone this should hop into MetaMask's in-app browser. Do this on the real phone early.
4. Claim. The token mints to the connected wallet and the IPFS artwork replaces the placeholder.
5. Look the token up on `https://testnets.opensea.io` and on `https://sepolia.arbiscan.io`.
6. Tap tag 1 from a second wallet and transfer.
7. Repeat claim for the other nine, then transfer all ten to the account you will hold during the Alastria Blockchain Awards demo.

## 6. Later

- Dedicated Pinata gateway in `web/config.local.js`, if the public gateway is slow or rate-limits during the demo.
- A full phone pass of the MetaMask deep link on Android and iOS. WalletConnect is the fallback if the deep link drops the key or fails to open.
- If a tag is lost or a key leaks before that token is claimed, call `updateChip` with a new `CHIP_KEY_*` address and rewrite that one tag. `removeChip` clears a pair. The mint check blocks the old key.
- Repinning metadata on this same contract is `setBaseURI` from the owner, with the trailing slash. A new key set still means a new deploy, because the trial keys and these ten keys are different accounts.
- Arbitrum One only after mint, verify, and transfer work on all ten. Check whether `claimTxOverrides` is still needed there. Deploy `Season1byMazh`, point `web/config.js` at chain id `42161`, the mainnet RPC, and the new address. Mint token 1 and confirm OpenSea shows the IPFS image and traits.
- Path B payments, embedded wallets, and on-ramps wait until people have scanned real tags. See the payments section above.
- A real NFC chip replaces `web/chip.js` and its `signDigest`. The contract side stays the same shape: an address that signs a challenge.
