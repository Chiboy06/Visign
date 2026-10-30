"""Download a balanced sample of the NSL Alphanumeric Dataset (CC BY 4.0, Adeniyan et al.)
without fetching the 17.8 GB split archive: read its table of contents, then byte-range single images.

Usage: python -I scripts/nsl_sample.py [per_class=15] [out=data/raw/nsl]
Then load the folder in /tools/convert.
"""
import collections, os, re, struct, sys, time, urllib.request, zlib

RECORD = "https://zenodo.org/api/records/21672976/files/NSL_Dataset_Full.{}/content"
LAST_DISK = 9  # parts .z01..z09 are disks 0-8, .zip is disk 9
MAX_BYTES = 3_000_000  # skip the odd huge frame


def get(part, start=None, end=None):
    headers = {"User-Agent": "visign-dataset-sampler"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}" if end is not None else f"bytes={start}"
    for attempt in range(5):  # connections in Lagos drop DNS intermittently
        try:
            return urllib.request.urlopen(urllib.request.Request(RECORD.format(part), headers=headers), timeout=180).read()
        except OSError as err:
            print(f"  retry {attempt + 1}: {err}")
            time.sleep(5)
    raise SystemExit(f"giving up on {part}")


def index():
    tail = get("zip", "-16777216")  # last 16 MB holds the central directory
    eocd = tail.rfind(b"PK\x05\x06")
    z64 = tail.rfind(b"PK\x06\x06", 0, eocd)
    cd_size = struct.unpack("<Q", tail[z64 + 40:z64 + 48])[0] if z64 >= 0 else struct.unpack("<I", tail[eocd + 12:eocd + 16])[0]
    pos = (z64 if z64 >= 0 else eocd) - cd_size
    assert tail[pos:pos + 4] == b"PK\x01\x02", "central directory not inside the 16 MB tail"
    entries = []
    while tail[pos:pos + 4] == b"PK\x01\x02":
        (_, _, _, _, method, _, _, _, csize, usize, nlen, xlen, clen, disk, _, _, off) = struct.unpack(
            "<IHHHHHHIIIHHHHHII", tail[pos:pos + 46])
        name = tail[pos + 46:pos + 46 + nlen].decode("utf-8", "replace")
        extra = tail[pos + 46 + nlen:pos + 46 + nlen + xlen]
        i = 0
        while i + 4 <= len(extra):  # zip64 extra field replaces 0xFFFF.. placeholders, in this order
            hid, hsz = struct.unpack("<HH", extra[i:i + 4])
            if hid == 1:
                j = i + 4
                if usize == 0xFFFFFFFF: usize = struct.unpack("<Q", extra[j:j + 8])[0]; j += 8
                if csize == 0xFFFFFFFF: csize = struct.unpack("<Q", extra[j:j + 8])[0]; j += 8
                if off == 0xFFFFFFFF: off = struct.unpack("<Q", extra[j:j + 8])[0]; j += 8
                if disk == 0xFFFF: disk = struct.unpack("<I", extra[j:j + 4])[0]
            i += 4 + hsz
        if name.lower().endswith(".jpg"):
            entries.append(dict(name=name, method=method, csize=csize, disk=disk, off=off, nlen=nlen))
        pos += 46 + nlen + xlen + clen
    return entries


def source_key(file):  # same rule as lib/dataset.ts sourceKey
    s = re.sub(r"_aug\d+(\.\w+)?$", "", file)
    s = re.sub(r"_\d+$", "", s)
    return re.sub(r"frame_\d+$", "frame", s)


def pick(entries, per_class):
    by_class = collections.defaultdict(lambda: collections.defaultdict(list))
    for e in entries:
        if e["csize"] > MAX_BYTES:
            continue
        file = e["name"].rsplit("/", 1)[-1]
        by_class[file.split("_")[0].upper()][source_key(file)].append(e)
    chosen = []
    for label, groups in sorted(by_class.items()):
        queues = [sorted(g, key=lambda e: e["csize"]) for g in groups.values()]
        queues.sort(key=lambda q: q[0]["csize"])  # cheapest sources first
        taken = 0
        while taken < per_class and any(queues):
            for q in queues:  # round-robin across source videos for signer/background variety
                if q and taken < per_class:
                    chosen.append(q.pop(0)); taken += 1
    return chosen


def fetch(e):
    part = "zip" if e["disk"] == LAST_DISK else f"z{e['disk'] + 1:02d}"
    buf = get(part, e["off"], e["off"] + 30 + e["nlen"] + 1024 + e["csize"])
    if buf[:4] != b"PK\x03\x04":
        return None
    nlen, xlen = struct.unpack("<HH", buf[26:30])
    raw = buf[30 + nlen + xlen:30 + nlen + xlen + e["csize"]]
    if len(raw) < e["csize"]:
        return None  # entry crosses a part boundary
    return raw if e["method"] == 0 else zlib.decompress(raw, -15)


def main():
    per_class = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join("data", "raw", "nsl")
    os.makedirs(out, exist_ok=True)
    print("reading archive index...")
    chosen = pick(index(), per_class)
    print(f"fetching {len(chosen)} images ({sum(e['csize'] for e in chosen) / 1e6:.1f} MB)")
    ok = 0
    for n, e in enumerate(chosen, 1):
        path = os.path.join(out, e["name"].rsplit("/", 1)[-1])
        if os.path.exists(path):
            ok += 1; continue
        body = fetch(e)
        if body:
            open(path, "wb").write(body); ok += 1
        if n % 25 == 0:
            print(f"  {n}/{len(chosen)}")
    with open(os.path.join(out, "SOURCE.txt"), "w") as f:
        f.write("Nigerian Sign Language (NSL) Alphanumeric Dataset, Adeniyan, Afolayan & Johnson, 2026.\n"
                "https://zenodo.org/records/21672976  License: CC BY 4.0\n")
    print(f"done: {ok}/{len(chosen)} images in {out}")


if __name__ == "__main__":
    main()
