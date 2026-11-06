// Local stand-in for a later profile record. The shape is what a contract
// or server would store: which piece is shown first, and the order of the rest.

function key(address) {
  return `mazh.profile.${address.toLowerCase()}`;
}

function refKey(ref) {
  return `${ref.collectionId}:${ref.tokenId}`;
}

export function loadProfile(address) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(address)) ?? "null");
    if (!saved || typeof saved !== "object") return { featured: null, order: [] };
    return {
      featured: saved.featured ?? null,
      order: Array.isArray(saved.order) ? saved.order : [],
    };
  } catch {
    return { featured: null, order: [] };
  }
}

function saveProfile(address, profile) {
  localStorage.setItem(key(address), JSON.stringify(profile));
}

export function arrangePieces(address, owned) {
  const saved = loadProfile(address);
  const byRef = new Map(owned.map((piece) => [refKey(piece), piece]));
  const ordered = [];

  for (const ref of saved.order) {
    const piece = byRef.get(refKey(ref));
    if (!piece) continue;
    ordered.push(piece);
    byRef.delete(refKey(ref));
  }
  for (const piece of byRef.values()) ordered.push(piece);

  if (saved.featured) {
    const index = ordered.findIndex((piece) => refKey(piece) === refKey(saved.featured));
    if (index > 0) ordered.unshift(ordered.splice(index, 1)[0]);
  }
  return ordered;
}

export function setFeatured(address, owned, piece) {
  const ordered = arrangePieces(address, owned).filter(
    (item) => refKey(item) !== refKey(piece),
  );
  ordered.unshift(piece);
  saveProfile(address, {
    featured: { collectionId: piece.collectionId, tokenId: piece.tokenId },
    order: ordered.map(({ collectionId, tokenId }) => ({ collectionId, tokenId })),
  });
}

export function movePiece(address, owned, piece, direction) {
  const ordered = arrangePieces(address, owned);
  const index = ordered.findIndex((item) => refKey(item) === refKey(piece));
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ordered.length) return;
  const [item] = ordered.splice(index, 1);
  ordered.splice(next, 0, item);
  const featured = ordered[0];
  saveProfile(address, {
    featured: { collectionId: featured.collectionId, tokenId: featured.tokenId },
    order: ordered.map(({ collectionId, tokenId }) => ({ collectionId, tokenId })),
  });
}
