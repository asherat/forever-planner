export type LuaValue = string | number | boolean | null | LuaTable;
export interface LuaTable {
  [key: string]: LuaValue;
}

interface LuaCursor {
  text: string;
  offset: number;
}

function skipWhitespace(cursor: LuaCursor): void {
  while (cursor.offset < cursor.text.length) {
    if (/\s/.test(cursor.text[cursor.offset])) {
      cursor.offset += 1;
    } else if (cursor.text.startsWith("--", cursor.offset)) {
      const lineEnd = cursor.text.indexOf("\n", cursor.offset);
      if (lineEnd === -1) {
        cursor.offset = cursor.text.length;
      } else {
        cursor.offset = lineEnd + 1;
      }
    } else {
      break;
    }
  }
}

function readString(cursor: LuaCursor): string {
  const quote = cursor.text[cursor.offset];
  cursor.offset += 1;
  let value = "";
  while (cursor.offset < cursor.text.length && cursor.text[cursor.offset] !== quote) {
    if (cursor.text[cursor.offset] === "\\") {
      cursor.offset += 1;
    }
    value += cursor.text[cursor.offset];
    cursor.offset += 1;
  }
  cursor.offset += 1;
  return value;
}

function readWord(cursor: LuaCursor): LuaValue {
  const match = /^[A-Za-z0-9_.+-]+/.exec(cursor.text.slice(cursor.offset, cursor.offset + 64));
  if (match === null) {
    throw new Error("Unexpected Lua at offset " + cursor.offset);
  }
  cursor.offset += match[0].length;
  const word = match[0];
  if (word === "true") {
    return true;
  }
  if (word === "false") {
    return false;
  }
  if (word === "nil") {
    return null;
  }
  if (/^-?\d/.test(word)) {
    return Number(word);
  }
  return word;
}

function readTable(cursor: LuaCursor): LuaTable {
  cursor.offset += 1;
  const table: LuaTable = {};
  let nextIndex = 1;
  skipWhitespace(cursor);
  while (cursor.text[cursor.offset] !== "}") {
    let key: string | null = null;
    if (cursor.text[cursor.offset] === "[") {
      cursor.offset += 1;
      skipWhitespace(cursor);
      key = String(readValue(cursor));
      skipWhitespace(cursor);
      cursor.offset += 1;
      skipWhitespace(cursor);
      cursor.offset += 1;
    } else {
      const start = cursor.offset;
      const word = /^[A-Za-z_][A-Za-z0-9_]*\s*=/.exec(cursor.text.slice(start, start + 64));
      if (word !== null && cursor.text[start] !== "{") {
        key = word[0].replace(/\s*=$/, "");
        cursor.offset += word[0].length;
      }
    }
    skipWhitespace(cursor);
    const value = readValue(cursor);
    if (key === null) {
      key = String(nextIndex);
      nextIndex += 1;
    }
    table[key] = value;
    skipWhitespace(cursor);
    if (cursor.text[cursor.offset] === "," || cursor.text[cursor.offset] === ";") {
      cursor.offset += 1;
    }
    skipWhitespace(cursor);
  }
  cursor.offset += 1;
  return table;
}

function readValue(cursor: LuaCursor): LuaValue {
  skipWhitespace(cursor);
  const character = cursor.text[cursor.offset];
  if (character === "{") {
    return readTable(cursor);
  }
  if (character === "\"" || character === "'") {
    return readString(cursor);
  }
  return readWord(cursor);
}

export function parseLuaValue(text: string): LuaValue {
  return readValue({ text: text, offset: 0 });
}

export function braceBalance(line: string): number {
  let balance = 0;
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "\"") {
      inString = !inString;
    } else if (!inString && character === "{") {
      balance += 1;
    } else if (!inString && character === "}") {
      balance -= 1;
    }
  }
  return balance;
}

export function isLuaTable(value: LuaValue | undefined): value is LuaTable {
  return value !== null && value !== undefined && typeof value === "object";
}
