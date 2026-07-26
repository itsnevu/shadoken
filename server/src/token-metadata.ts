export interface TokenMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

const BADGE_NAMES = new Map<number, string>([
  [1, 'Neon Runner Badge'],
  [2, 'Score Breaker Badge'],
  [3, 'Chamber Raider Badge'],
  [4, 'Shadow Legend Badge'],
]);

export function tokenMetadata(tokenId: number, baseUrl: string): TokenMetadata | null {
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return null;

  const isBadge = tokenId < 1000;
  const name = BADGE_NAMES.get(tokenId) ?? (isBadge ? `Arena Badge #${tokenId}` : `Neon Cosmetic #${tokenId}`);
  const kind = isBadge ? 'Achievement Badge' : 'Cosmetic';
  const image = `${baseUrl.replace(/\/$/, '')}/api/metadata/${tokenId}.svg`;

  return {
    name,
    description:
      'Shadoken Arena ERC1155 token for RobinhoodChain. Pool-funded runs use server-signed EIP-712 claims and on-chain season accounting.',
    image,
    attributes: [
      { trait_type: 'Game', value: 'Shadoken Arena' },
      { trait_type: 'Chain', value: 'RobinhoodChain' },
      { trait_type: 'Type', value: kind },
      { trait_type: 'Token ID', value: tokenId },
      { trait_type: 'Primary Color', value: '#CCFF00' },
      { trait_type: 'Base Color', value: '#1C180D' },
    ],
  };
}

export function tokenSvg(tokenId: number): string | null {
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return null;
  const label = tokenId < 1000 ? 'BADGE' : 'COSMETIC';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="Shadoken ${label} ${tokenId}">
  <rect width="640" height="640" fill="#1C180D"/>
  <circle cx="320" cy="292" r="188" fill="none" stroke="#CCFF00" stroke-width="24"/>
  <path d="M320 112l58 118 130 19-94 92 22 130-116-61-116 61 22-130-94-92 130-19z" fill="#CCFF00"/>
  <text x="320" y="530" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#CCFF00">${label}</text>
  <text x="320" y="580" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#ffffff">#${tokenId}</text>
</svg>`;
}
