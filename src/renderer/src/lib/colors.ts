/** A fixed pastel palette so the same item index always gets the same colour in tables and in the 3D view. */
export const PALETTE = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3', '#1f78b4', '#33a02c', '#fb9a99', '#fdbf6f', '#cab2d6', '#6a3d9a', '#b15928', '#a6cee3']

export function colorFor(index: number, override?: string | null): string {
  return override || PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]
}
