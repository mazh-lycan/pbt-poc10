import { collections, collectionById } from "./collections.js";
import {
  chipSigned,
  claimDigest,
  contractFor,
  describeError,
  loadCollection,
  loadPiece,
  pieceForChip,
  piecesOwnedBy,
  submitClaim,
} from "./chain.js";
import { scannedItemActions } from "./item-actions.js";
import { arrangePieces, movePiece, setFeatured } from "./profile.js";
import { scanChip, scanQr } from "./scan.js";
import { getSession, handoffUrl, newSessionId, putSession } from "./session.js";
import { getAddress } from "./ethers.js";
import {
  connectWallet,
  currentAccount,
  forgetKeyInAddress,
  onAccount,
  short,
  signerFor,
} from "./wallet.js";

const view = document.querySelector("#view");
const accountLink = document.querySelector("#account");
const connectButton = document.querySelector("#connect");
const statusLine = document.querySelector("#status");

let editing = false;
let qrScanner = null;
let viewGeneration = 0;
let handoffTicket = 0;

function setStatus(text) {
  statusLine.textContent = text ?? "";
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value != null && value !== false) node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function route() {
  const parts = (location.hash.replace(/^#/, "") || "/")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === "collection" && parts[1]) {
    return {
      page: parts[2] ? "piece" : "collection",
      id: parts[1],
      tokenId: parts[2] ? Number(parts[2]) : null,
    };
  }
  if (parts[0] === "collector" && parts[1]) {
    return { page: "collector", address: parts[1] };
  }
  if (parts[0] === "handoff" && parts[1] && parts[2]) {
    return { page: "handoff", id: parts[1], address: parts[2] };
  }
  return { page: "home" };
}

function sameRoute(snapshot) {
  const now = route();
  return now.page === snapshot.page && now.id === snapshot.id && now.tokenId === snapshot.tokenId && now.address === snapshot.address;
}

function paintAccount() {
  const account = currentAccount();
  if (!account) {
    accountLink.hidden = true;
    connectButton.hidden = false;
    return;
  }
  connectButton.hidden = true;
  accountLink.hidden = false;
  accountLink.textContent = short(account);
  accountLink.href = `#/collector/${account}`;
}

async function stopQr() {
  if (!qrScanner) return;
  try {
    await qrScanner.stop();
  } catch {
    // The camera is already stopped.
  }
  qrScanner = null;
}

function renderHome() {
  view.append(
    h(
      "div",
      { class: "banners" },
      collections.map((collection) =>
        h(
          "a",
          { class: "banner", href: `#/collection/${collection.id}` },
          h("img", { src: collection.banner, alt: "" }),
          h("span", {}, collection.name),
        ),
      ),
    ),
  );
}

async function renderCollection(id) {
  const here = route();
  const collection = collectionById(id);
  if (!collection) {
    view.append(h("p", {}, "That collection is not part of Mazh Seasons."));
    return;
  }
  view.append(
    h("img", { class: "hero", src: collection.banner, alt: "" }),
    h("h1", {}, collection.name),
  );
  if (!collection.contractAddress) {
    view.append(h("p", { class: "quiet" }, "No pieces published yet."));
    return;
  }
  setStatus("Loading the collection…");
  try {
    const pieces = await loadCollection(collection);
    if (!sameRoute(here)) return;
    setStatus("");
    view.append(h("div", { class: "grid" }, pieces.map(pieceCard)));
  } catch (error) {
    setStatus(describeError(error));
  }
}

function pieceCard(piece) {
  return h(
    "a",
    { class: "card", href: `#/collection/${piece.collectionId}/${piece.tokenId}` },
    h("img", { src: piece.image, alt: piece.name }),
    h("strong", {}, piece.name),
  );
}

async function renderPiece(id, tokenId) {
  const here = route();
  const collection = collectionById(id);
  if (!collection?.contractAddress || !Number.isInteger(tokenId)) {
    view.append(h("p", {}, "That piece is not published."));
    return;
  }
  setStatus("Loading the piece…");
  try {
    const piece = await loadPiece(collection, tokenId);
    if (!sameRoute(here)) return;
    setStatus("");
    const owner = piece.holder
      ? h("a", { href: `#/collector/${piece.holder}` }, short(piece.holder))
      : "Unclaimed";
    view.append(
      h("img", { class: "hero", src: piece.image, alt: piece.name }),
      h("h1", {}, piece.name),
      h("p", {}, piece.description),
      h("p", { class: "quiet" }, "Held by ", owner),
      h("p", {}, h("a", { href: `#/collection/${collection.id}` }, collection.name)),
    );
  } catch (error) {
    setStatus(describeError(error));
  }
}

function addItemPanel() {
  const box = h("div");
  return h(
    "section",
    {},
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", onClick: () => startHandoff(box) }, "Add item"),
    ),
    box,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drawQr(url) {
  const canvas = h("canvas", { class: "handoff-qr" });
  const { default: QRCode } = await import(
    "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm"
  );
  await QRCode.toCanvas(canvas, url, { width: 240, margin: 1 });
  return canvas;
}

// The laptop holds the wallet. The phone holds the tag. The mailbox carries
// only the signature. A later proof-of-ownership message can arrive the same way.
async function startHandoff(box) {
  const ticket = ++handoffTicket;
  const generation = viewGeneration;
  const to = currentAccount();
  if (!to) return;
  const alive = () => ticket === handoffTicket && generation === viewGeneration;
  const id = newSessionId();
  const url = handoffUrl(id, to);
  box.replaceChildren(h("p", {}, "Scan this with your phone, then hold the tag to the phone."));
  try {
    box.append(await drawQr(url));
  } catch (error) {
    box.append(h("a", { href: url }, url));
    setStatus(describeError(error));
  }
  if (!alive()) return;

  const started = Date.now();
  while (alive() && Date.now() - started < 5 * 60 * 1000) {
    try {
      const message = await getSession(id);
      if (!alive()) return;
      if (message) {
        await receiveClaim(message, to, alive);
        return;
      }
    } catch (error) {
      if (!alive()) return;
      setStatus(describeError(error));
    }
    await sleep(1000);
  }
  if (alive()) setStatus("That code expired. Press Add item for a new one.");
}

async function receiveClaim(message, to, alive) {
  setStatus("The phone read a tag. Checking it…");
  let chipAddress;
  try {
    chipAddress = getAddress(message.chip);
  } catch {
    setStatus("The phone sent a signature this wallet cannot use.");
    return;
  }
  try {
    const piece = await pieceForChip({ address: chipAddress });
    if (!alive()) return;
    if (!piece) {
      setStatus("This key is not part of a Mazh collection.");
      return;
    }
    if (piece.holder && piece.holder.toLowerCase() === to.toLowerCase()) {
      setStatus("This piece is already in your wallet.");
      return;
    }
    const { digest } = await claimDigest({
      collectionId: piece.collectionId,
      chipAddress,
      to,
      signatureTimestamp: message.signatureTimestamp,
    });
    if (!chipSigned(digest, message.signature, chipAddress)) {
      setStatus("The phone sent a signature this wallet cannot use.");
      return;
    }
    setStatus("Confirm the transaction in MetaMask.");
    const signed = await signerFor((signer) => contractFor(piece.collectionId, signer));
    if (!signed) {
      setStatus("Connect the wallet on this computer.");
      return;
    }
    await submitClaim({
      signerContract: signed,
      chipAddress,
      to,
      holder: piece.holder,
      signature: message.signature,
      signatureTimestamp: message.signatureTimestamp,
    });
    if (!alive()) return;
    setStatus("The piece is in your wallet.");
    editing = false;
    render();
  } catch (error) {
    const code = error?.code ?? error?.error?.code;
    setStatus(code === 4001 ? "Claim rejected in MetaMask." : describeError(error));
  }
}

async function renderHandoff(id, address) {
  if (!/^[0-9a-f]{32}$/.test(id)) {
    view.append(h("p", {}, "That link is not a claim code."));
    return;
  }
  let to;
  try {
    to = getAddress(address);
  } catch {
    view.append(h("p", {}, "That link is not a claim code."));
    return;
  }
  const found = h("div");
  const qr = h("div", { id: "qr-reader" });
  view.append(
    h("h1", {}, "Add this piece"),
    h("p", {}, "It will go to"),
    h("p", { class: "quiet" }, to),
    h("p", {}, "Hold the tag against the phone."),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "button", onClick: () => readPieceQr(qr, found, id, to) }, "Scan the piece QR"),
    ),
    qr,
    found,
  );
  const generation = viewGeneration;
  await scanChip({
    onStatus: setStatus,
    onKey: (chip) => {
      if (generation !== viewGeneration) return;
      offerSend(found, id, to, chip);
    },
  });
}

async function readPieceQr(qr, found, id, to) {
  const generation = viewGeneration;
  await stopQr();
  setStatus("Allow the camera, then point it at the QR code on the piece.");
  try {
    qrScanner = await scanQr({
      elementId: "qr-reader",
      onKey: (chip) => {
        if (generation !== viewGeneration) return;
        offerSend(found, id, to, chip);
      },
    });
  } catch (error) {
    setStatus(
      error?.name === "NotAllowedError"
        ? "Camera permission was denied."
        : describeError(error),
    );
  }
}

async function offerSend(found, id, to, chip) {
  await stopQr();
  setStatus("Looking up the piece…");
  found.replaceChildren();
  try {
    const piece = await pieceForChip(chip);
    if (!piece) {
      setStatus("This key is not part of a Mazh collection.");
      return;
    }
    setStatus("");
    const claim = scannedItemActions({ holder: piece.holder, viewer: to }).find(
      (action) => action.id === "claim",
    );
    found.append(
      h(
        "div",
        { class: "scan-result" },
        h("img", { src: piece.image, alt: piece.name }),
        h(
          "div",
          {},
          h("strong", {}, piece.name),
          h("p", {}, piece.description),
          h(
            "p",
            { class: "quiet" },
            piece.holder ? `Held by ${short(piece.holder)}` : "Unclaimed",
          ),
          claim
            ? h(
                "button",
                { type: "button", onClick: () => sendClaim(id, to, chip, piece, found) },
                claim.label,
              )
            : h("p", {}, "This piece is already in that wallet."),
        ),
      ),
    );
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function sendClaim(id, to, chip, piece, found) {
  setStatus("Sending the scan to the other screen…");
  try {
    const { digest, signatureTimestamp } = await claimDigest({
      collectionId: piece.collectionId,
      chipAddress: chip.address,
      to,
    });
    const signature = await chip.signDigest(digest);
    await putSession(id, {
      chip: chip.address,
      signature,
      signatureTimestamp: signatureTimestamp.toString(),
    });
    found.replaceChildren();
    setStatus("Sent. Confirm the claim on the other screen.");
  } catch (error) {
    setStatus(describeError(error));
  }
}

async function renderCollector(address) {
  const here = route();
  let checksum;
  try {
    checksum = getAddress(address);
  } catch {
    view.append(h("p", {}, "That is not a collector address."));
    return;
  }
  const mine = currentAccount()?.toLowerCase() === checksum.toLowerCase();
  view.append(h("h1", {}, mine ? "Your collection" : "Collector"));
  view.append(h("p", { class: "quiet" }, checksum));
  if (mine) {
    view.append(addItemPanel());
    view.append(
      h(
        "button",
        {
          type: "button",
          onClick: () => {
            editing = !editing;
            render();
          },
        },
        editing ? "Done" : "Edit profile",
      ),
    );
  }

  setStatus("Loading pieces…");
  try {
    const owned = await piecesOwnedBy(checksum);
    if (!sameRoute(here)) return;
    setStatus("");
    const ordered = arrangePieces(checksum, owned);
    if (ordered.length === 0) {
      view.append(h("p", {}, "No Mazh pieces in this wallet yet."));
      return;
    }
    view.append(
      h(
        "div",
        { class: "grid" },
        ordered.map((piece, index) => ownedCard(piece, checksum, owned, mine, index === 0)),
      ),
    );
  } catch (error) {
    setStatus(describeError(error));
  }
}

function ownedCard(piece, address, owned, mine, isMain) {
  const body = [
    h("img", { src: piece.image, alt: piece.name }),
    h("strong", {}, piece.name),
  ];
  if (mine && editing) {
    body.push(
      h(
        "div",
        { class: "row" },
        h("button", { type: "button", onClick: () => {
          setFeatured(address, owned, piece);
          render();
        } }, "Set as main"),
        h("button", { type: "button", onClick: () => {
          movePiece(address, owned, piece, -1);
          render();
        } }, "Up"),
        h("button", { type: "button", onClick: () => {
          movePiece(address, owned, piece, 1);
          render();
        } }, "Down"),
      ),
    );
    return h("article", { class: isMain ? "owned main-piece" : "owned" }, body);
  }
  return h(
    "a",
    {
      class: isMain ? "card main-piece" : "card",
      href: `#/collection/${piece.collectionId}/${piece.tokenId}`,
    },
    body,
  );
}

async function render() {
  viewGeneration += 1;
  handoffTicket += 1;
  await stopQr();
  if (route().page !== "collector") editing = false;
  paintAccount();
  view.replaceChildren();
  setStatus("");
  const current = route();
  if (current.page === "collection") return renderCollection(current.id);
  if (current.page === "piece") return renderPiece(current.id, current.tokenId);
  if (current.page === "collector") return renderCollector(current.address);
  if (current.page === "handoff") return renderHandoff(current.id, current.address);
  renderHome();
}

forgetKeyInAddress();
connectButton.addEventListener("click", () => {
  connectWallet().catch((error) => {
    const code = error?.code ?? error?.error?.code;
    setStatus(code === 4001 ? "Connection rejected in MetaMask." : describeError(error));
  });
});
onAccount(() => render());
window.addEventListener("hashchange", () => render());
render();
