const tseslint = require("typescript-eslint");
const vue = require("eslint-plugin-vue");

const HOUSE_RULES = [
  { selector: "ArrowFunctionExpression", message: "Use a named function." },
  { selector: "ConditionalExpression", message: "Use if/else." }
];

module.exports = tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "web/public/**", "data/**", "tools/**", "tests/**", "*.config.*"] },
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["web/src/**/*.ts", "web/src/**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      "no-restricted-syntax": ["error", ...HOUSE_RULES],
      "func-names": ["error", "always"],
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/multi-word-component-names": "off"
    }
  }
);
