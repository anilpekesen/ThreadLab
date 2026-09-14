/**
 * PNG'ye çözünürlük (DPI) bilgisini, görüntüyü yeniden sıkıştırmadan yazar.
 *
 * sharp ile `.withMetadata({ density })` yeniden kodlama gerektiriyor; tarayıcının
 * ürettiği baskı PNG'si zaten iyi sıkıştırılmış olduğundan sonuç %40'a varan
 * oranda BÜYÜYORDU (16 MB → 23 MB) ve dosya başına 1,5-2 sn işlemci harcıyordu.
 * Çözünürlük PNG'de yalnızca 21 baytlık bir `pHYs` bloğu; görüntü verisine
 * dokunmadan eklemek pikselleri birebir korur.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Var olan pHYs (ve çelişebilecek eXIf) bloğunu kaldırıp verilen DPI ile yenisini ilk IDAT'tan önce ekler.
 * Geçerli bir PNG değilse null döner — çağıran taraf yeniden kodlamaya düşebilir.
 */
export function setPngDensity(input: Buffer, dpi: number): Buffer | null {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physData = Buffer.alloc(9);
  physData.writeUInt32BE(pixelsPerMeter, 0);
  physData.writeUInt32BE(pixelsPerMeter, 4);
  physData.writeUInt8(1, 8); // birim: metre
  const phys = chunk("pHYs", physData);

  const parts: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let inserted = false;
  let sawIend = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > input.length) return null;
    if (type === "IDAT" && !inserted) {
      parts.push(phys);
      inserted = true;
    }
    // eXIf içindeki çözünürlük pHYs ile çelişebilir ve bazı okuyucular (libvips
    // dahil) onu öncelikli sayıyor; baskı dosyasında EXIF'in başka işlevi yok.
    if (type !== "pHYs" && type !== "eXIf") parts.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") { sawIend = true; break; }
  }
  if (!inserted || !sawIend) return null;
  return Buffer.concat(parts);
}
