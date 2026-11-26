function encodeHead(majorType, value, bytes) {
  if (value < 24) {
    bytes.push((majorType << 5) | value);
  } else if (value < 256) {
    bytes.push((majorType << 5) | 24, value);
  } else if (value < 65536) {
    bytes.push((majorType << 5) | 25, value >> 8, value & 255);
  } else {
    bytes.push((majorType << 5) | 26, (value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
  }
}

function encodeValue(value, bytes) {
  if (typeof value === "number") {
    encodeHead(0, value, bytes);
  } else if (typeof value === "string") {
    const encoded = Buffer.from(value, "utf8");
    encodeHead(3, encoded.length, bytes);
    bytes.push(...encoded);
  } else if (Array.isArray(value)) {
    encodeHead(4, value.length, bytes);
    for (const element of value) {
      encodeValue(element, bytes);
    }
  } else {
    const keys = Object.keys(value);
    encodeHead(5, keys.length, bytes);
    for (const key of keys) {
      if (/^\d+$/.test(key)) {
        encodeValue(Number(key), bytes);
      } else {
        encodeValue(key, bytes);
      }
      encodeValue(value[key], bytes);
    }
  }
}

function encodeBase64(value) {
  const bytes = [];
  encodeValue(value, bytes);
  return Buffer.from(bytes).toString("base64");
}

module.exports = { encodeBase64 };
