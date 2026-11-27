const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WEB_DIRECTORY = path.join(__dirname, "..", "..", "web", "public");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      if (values.has(key)) {
        return values.get(key);
      }
      return null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

function loadScripts(fileNames, extraGlobals) {
  const context = {
    console: console,
    atob: atob,
    btoa: btoa,
    TextDecoder: TextDecoder,
    localStorage: createStorage(),
    Date: Date,
    Math: Math
  };
  Object.assign(context, extraGlobals || {});
  context.window = context;
  vm.createContext(context);
  for (const fileName of fileNames) {
    const source = fs.readFileSync(path.join(WEB_DIRECTORY, fileName), "utf8");
    vm.runInContext(source, context, { filename: fileName });
  }
  return context;
}

function evaluate(context, expression) {
  return vm.runInContext(expression, context);
}

module.exports = { loadScripts, evaluate };
