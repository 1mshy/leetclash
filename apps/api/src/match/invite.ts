import { randomInt } from "node:crypto";
import { INVITE_CODE_LENGTH } from "@leetclash/shared";

// Unambiguous alphabet (no 0/O/1/I/L) for shout-across-the-room invite codes.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}
