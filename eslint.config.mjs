import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next still ships eslintrc-style `extends` (e.g.
// "plugin:@next/next/core-web-vitals"), which ESLint 9's flat config can't consume
// directly. FlatCompat bridges them — this is the canonical Next 15 + ESLint 9 setup.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // .open-next/ is OpenNext's generated Worker bundle; .claude/ is local agent
    // tooling (CommonJS hook scripts) — neither is part of the Next app, don't lint them.
    ignores: [".next/**", ".open-next/**", ".claude/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
