import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Ghost",
    identifier: "com.ghostapp.desktop",
    version: "0.1.0",
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
      codesign: false,
      notarize: false,
      icon: "assets/icon.icns",
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
      icon: "assets/icon.ico",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {},
  release: {
    baseUrl:
      "https://github.com/ferdousbhai/ghost-app/releases/latest/download",
  },
} satisfies ElectrobunConfig;
