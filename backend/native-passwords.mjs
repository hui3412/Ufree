import {scrypt} from "node:crypto";
import {bytesToHex,hexToBytes} from "@noble/hashes/utils";
const random=()=>bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
export async function passwordHash(password, salt = random()) {
  // Preserve the existing scrypt profile and hash format, using the runtime's native implementation.
  const value = await new Promise((resolve, reject) => {
    scrypt(password, hexToBytes(salt), 32, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
  return `scrypt$32768$8$3$${salt}$${bytesToHex(value)}`;
}
