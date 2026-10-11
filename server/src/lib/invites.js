import { randomInt } from "crypto";

// Invite codes: how signup is limited to the people Matt invites. Matt makes
// them in Admin (routes/admin.js); signup spends one use of one
// (routes/auth.js). The rules live here, away from the routes, so they can be
// tested on their own.

// 8 letters and digits, written "K7M2-QX9P". Without 0, O, 1, I and L, which
// look alike, so a code can be read out loud or typed on a phone. 31^8 is
// about 850 billion codes: nobody finds one by guessing.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export const MAX_NOTE_LENGTH = 80;
export const MAX_USES = 100; // the most one code can allow
export const MAX_EXPIRY_DAYS = 365;

function grouped(raw) {
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function generateCode(random = randomInt) {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[random(ALPHABET.length)];
  return grouped(raw);
}

// What a person typed, as it is stored: capitals, no spaces, and the dash in
// the middle whether or not they typed it ("k7m2 qx9p" and "K7M2QX9P" are
// "K7M2-QX9P"). Anything that isn't 8 letters/digits stays as bare letters
// and digits, which no stored code matches.
export function normalizeCode(input) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === CODE_LENGTH ? grouped(raw) : raw;
}

// Where a code stands: "active" (can be used), "off" (switched off),
// "expired", "used" (every use is spent) or "unknown" (no such code). The
// order is the order of the messages: a code that is both switched off and
// used up says it was switched off.
export function inviteState(invite, now = new Date()) {
  if (!invite) return "unknown";
  if (!invite.active) return "off";
  if (invite.expiresAt && new Date(invite.expiresAt) <= now) return "expired";
  if (invite.usedCount >= invite.maxUses) return "used";
  return "active";
}

// The server message (lib/i18n.js) for each way a code can be refused.
export const INVITE_MESSAGE_KEYS = {
  required: "inviteRequired",
  unknown: "inviteUnknown",
  off: "inviteOff",
  expired: "inviteExpired",
  used: "inviteUsed",
};

export class InviteError extends Error {
  constructor(reason) {
    super(`Invite code refused: ${reason}`);
    this.reason = reason;
  }
}

// Why signup with this code is refused, or null when it can go ahead. A quick
// look before any work is done (redeemInvite is the check that counts).
export async function inviteProblem(db, rawCode, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (!code) return "required";
  const state = inviteState(await db.inviteCode.findUnique({ where: { code } }), now);
  return state === "active" ? null : state;
}

// Spends one use of the code, inside the transaction that creates the
// account (so an account that couldn't be created doesn't cost a use). The
// spending is one conditional update, so two signups racing for the last use
// can't both get it. Throws InviteError when the code can't be used.
export async function redeemInvite(tx, rawCode, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (!code) throw new InviteError("required");
  const invite = await tx.inviteCode.findUnique({ where: { code } });
  const state = inviteState(invite, now);
  if (state !== "active") throw new InviteError(state);
  const spent = await tx.inviteCode.updateMany({
    where: {
      id: invite.id,
      active: true,
      usedCount: { lt: invite.maxUses },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { usedCount: { increment: 1 } },
  });
  if (spent.count !== 1) throw new InviteError("used");
  return invite;
}

// What Matt typed to make a code, checked: { note, maxUses, expiresInDays }
// (expiresInDays null = never expires), or { error } with the message key.
export function cleanInviteInput(body) {
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) return { error: "inviteNoteTooLong" };

  const maxUses = body?.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > MAX_USES) return { error: "inviteBadUses" };

  const days = body?.expiresInDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)) return { error: "inviteBadExpiry" };

  return { note: note || null, maxUses, expiresInDays: days };
}

export function expiryDate(days, now = new Date()) {
  return days == null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

// One code as the Admin list shows it: the code, its note, its uses, when it
// expires, whether it is switched on, where it stands, and the emails that
// signed up with it.
export function inviteRow(invite, now = new Date()) {
  return {
    id: invite.id,
    code: invite.code,
    note: invite.note,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt,
    active: invite.active,
    state: inviteState(invite, now),
    createdAt: invite.createdAt,
    usedBy: (invite.users ?? []).map((user) => user.email),
  };
}
