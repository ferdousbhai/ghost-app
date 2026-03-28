import { Wallet, getDecodedToken, type Proof } from "@cashu/cashu-ts";
import { generateSecretKey, getPublicKey } from "nostr-tools";

/** Generate a secp256k1 keypair for P2PK-locked Cashu tokens (separate from Nostr identity). */
export function generateP2PKKeypair(): { privkeyHex: string; pubkeyHex: string } {
  const privkey = generateSecretKey();
  const hex = Array.from(privkey, (b) => b.toString(16).padStart(2, "0")).join("");
  return { privkeyHex: hex, pubkeyHex: getPublicKey(privkey) };
}

/** Decode a Cashu token string and return its mint URL and total amount. */
export function decodeToken(tokenStr: string): { mintUrl: string; totalAmount: number } {
  const decoded = getDecodedToken(tokenStr);
  const totalAmount = decoded.proofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);
  return { mintUrl: decoded.mint, totalAmount };
}

/** Redeem a P2PK-locked Cashu token at the mint. Returns the amount in sats. Throws on failure. */
export async function redeemToken(tokenStr: string, privkeyHex: string): Promise<number> {
  const { mintUrl, totalAmount } = decodeToken(tokenStr);
  const wallet = new Wallet(mintUrl, { unit: "sat" });
  await wallet.loadMint();
  await wallet.ops.receive(tokenStr).privkey(privkeyHex).run();
  return totalAmount;
}
