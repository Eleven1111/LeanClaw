import { deflateSync } from 'zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ICON_SIZE = 16
const MARGIN = 3

const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function distanceToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

export function isTrayMarkPixel(x: number, y: number): boolean {
  const path: [number, number, number, number][] = [
    [4, 4, 4, 10],
    [4, 10, 7, 13],
    [7, 13, 12, 7]
  ]
  return path.some(([x1, y1, x2, y2]) => distanceToSegment(x, y, x1, y1, x2, y2) <= 1.25)
}

function buildRawPixels(size: number): Buffer {
  const stride = 1 + size * 4
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const inside = x >= MARGIN && x < size - MARGIN && y >= MARGIN && y < size - MARGIN && isTrayMarkPixel(x, y)
      const px = rowStart + 1 + x * 4
      raw[px] = 0
      raw[px + 1] = 0
      raw[px + 2] = 0
      raw[px + 3] = inside ? 255 : 0
    }
  }
  return raw
}

/**
 * 生成一个 16x16 单色路径/核验标记 PNG 的 data URL，供 macOS 菜单栏模板图标使用。
 * 不依赖任何外部图标文件；alpha 通道决定 Template Image 的显示形状。
 */
export function buildTrayIconDataURL(): string {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ICON_SIZE, 0)
  ihdr.writeUInt32BE(ICON_SIZE, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(buildRawPixels(ICON_SIZE))
  const png = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}
