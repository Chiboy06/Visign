// Meta accepts mono 16-bit PCM WAV at 16 or 24 kHz. Validate the header before paying for a call.
export function wavInfo(buf: ArrayBuffer) {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  if (channels !== 1 || bits !== 16 || (sampleRate !== 16000 && sampleRate !== 24000)) return null;
  return { sampleRate, bytes: buf.byteLength };
}
