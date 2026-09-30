// Test helper: builds small Adobe Swatch Exchange buffers by hand (no third-party files).

export type AseTestBlock =
  | { kind: 'groupStart'; name: string }
  | { kind: 'groupEnd' }
  | { kind: 'color'; name: string; model: string; values: number[]; colorType?: number }
  | { kind: 'raw'; type: number; data: number[] };

function nameBytes(name: string): number[] {
  const units = name.length + 1;
  const bytes = [(units >> 8) & 255, units & 255];
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    bytes.push((code >> 8) & 255, code & 255);
  }
  bytes.push(0, 0);
  return bytes;
}

function float32Bytes(value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

function blockData(block: AseTestBlock): { type: number; data: number[] } {
  switch (block.kind) {
    case 'groupStart':
      return { type: 0xc001, data: nameBytes(block.name) };
    case 'groupEnd':
      return { type: 0xc002, data: [] };
    case 'color': {
      const model = block.model.padEnd(4, ' ').slice(0, 4);
      const data = [...nameBytes(block.name), ...[...model].map((c) => c.charCodeAt(0))];
      for (const value of block.values) data.push(...float32Bytes(value));
      const colorType = block.colorType ?? 1;
      data.push((colorType >> 8) & 255, colorType & 255);
      return { type: 0x0001, data };
    }
    case 'raw':
      return { type: block.type, data: block.data };
  }
}

/** A complete ASE file: 'ASEF', version (default 1.0), block count (default = blocks.length), blocks. */
export function buildAse(
  blocks: AseTestBlock[],
  { version = 1, blockCount = blocks.length }: { version?: number; blockCount?: number } = {},
): ArrayBuffer {
  const bytes: number[] = [0x41, 0x53, 0x45, 0x46, 0, version, 0, 0];
  bytes.push((blockCount >>> 24) & 255, (blockCount >>> 16) & 255, (blockCount >>> 8) & 255, blockCount & 255);
  for (const block of blocks) {
    const { type, data } = blockData(block);
    const n = data.length;
    bytes.push((type >> 8) & 255, type & 255, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...data);
  }
  return new Uint8Array(bytes).buffer;
}
