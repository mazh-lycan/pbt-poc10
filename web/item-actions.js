// Actions shown after a connected collector scans a piece.
// A later proof-of-ownership request is another entry in this list,
// handled beside "claim" by the profile page.

export function scannedItemActions({ holder, viewer }) {
  if (!viewer) return [];
  if (holder && holder.toLowerCase() === viewer.toLowerCase()) return [];
  return [
    {
      id: "claim",
      label: holder ? "Transfer to my wallet" : "Claim",
    },
  ];
}
