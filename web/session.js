import { config } from "./config.js";

// One mailbox per Add item click. The id is the only thing the two screens share.
export function newSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function handoffUrl(id, address) {
  const url = new URL(window.location.href);
  url.searchParams.delete("k");
  url.hash = `#/handoff/${id}/${address}`;
  return url.href;
}

export async function putSession(id, message) {
  const response = await fetch(`${config.mailboxUrl}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chip: message.chip,
      signature: message.signature,
      signatureTimestamp: message.signatureTimestamp,
    }),
  });
  if (!response.ok) throw new Error(`mailbox ${response.status}`);
  return response.json();
}

export async function getSession(id) {
  const response = await fetch(`${config.mailboxUrl}/${id}`);
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`mailbox ${response.status}`);
  return response.json();
}
