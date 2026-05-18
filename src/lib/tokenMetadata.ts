/**
 * Static lookup of token metadata for common Gnosis Chain assets and the
 * Circles protocol contracts. Lets the approval popup show "100 USDC" instead
 * of "100000000 on 0xddaf…".
 *
 * Keep this list short and curated. For anything not listed, the popup falls
 * back to truncated address + raw integer amount. A live `symbol()` /
 * `decimals()` fetch can be layered on top later if needed.
 */

export type TokenMetadata = {
	symbol: string;
	decimals: number;
	/** Optional human-readable label, e.g. "Circles Hub V2". Defaults to symbol. */
	label?: string;
};

// Keys must be lowercased addresses. Comparisons go through getTokenMetadata
// which normalises input, so callers don't need to remember.
const KNOWN_TOKENS: Readonly<Record<string, TokenMetadata>> = {
	// Stablecoins (Gnosis Chain)
	'0xddafbb505ad214d7b80b1f830fccc89b60fb7a83': { symbol: 'USDC', decimals: 6 },
	'0x2a22f9c3b484c3629090feed35f17ff8f88f76f0': { symbol: 'USDC.e', decimals: 6 },
	'0x4ecaba5870353805a9f068101a40e0f32ed605c6': { symbol: 'USDT', decimals: 6 },
	'0xe91d153e0b41518a2ce8dd3d7944fa863463a97d': { symbol: 'WXDAI', decimals: 18 },
	'0xaf204776c7245bf4147c2612bf6e5972ee483701': { symbol: 'sDAI', decimals: 18 },
	'0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1': { symbol: 'WETH', decimals: 18 },
	'0x9c58bacc331c9aa871afd802db6379a98e80cedb': { symbol: 'GNO', decimals: 18 },
	// Circles Hub V2 — not a token, but worth labelling when it appears as `to`.
	'0xc12c1e50abb450d6205ea2c3fa861b3b834d13e8': {
		symbol: 'CRC',
		decimals: 18,
		label: 'Circles Hub V2'
	}
};

export function getTokenMetadata(address: string | undefined | null): TokenMetadata | null {
	if (!address) return null;
	return KNOWN_TOKENS[address.toLowerCase()] ?? null;
}

/**
 * Format a raw token amount using the supplied decimals. Trims trailing zeros
 * in the fractional part. Returns just digits — caller appends the symbol.
 */
export function formatAmount(raw: bigint, decimals: number): string {
	if (decimals <= 0) return raw.toString();
	const base = 10n ** BigInt(decimals);
	const whole = raw / base;
	const fraction = raw % base;
	if (fraction === 0n) return whole.toString();
	const fracStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
	return `${whole}.${fracStr}`;
}

/** Convenience: format with symbol if known, otherwise raw integer. */
export function formatTokenAmount(
	raw: bigint,
	tokenAddress: string | undefined | null
): { display: string; symbol: string | null } {
	const meta = getTokenMetadata(tokenAddress);
	if (!meta) return { display: raw.toString(), symbol: null };
	return { display: formatAmount(raw, meta.decimals), symbol: meta.symbol };
}

/** Short label suitable for showing the token identity inline. */
export function formatToken(tokenAddress: string): string {
	const meta = getTokenMetadata(tokenAddress);
	if (meta) return meta.label ?? meta.symbol;
	return shortenAddress(tokenAddress);
}

export function shortenAddress(addr: string): string {
	if (!addr || addr.length < 10) return addr;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
