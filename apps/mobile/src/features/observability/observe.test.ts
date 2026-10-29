import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeVM from "node:vm";
import { expect, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const babel = require("@babel/core") as {
  transformFileSync: (file: string, options: Record<string, unknown>) => { code: string };
};
const code = babel.transformFileSync(NodePath.join(import.meta.dirname, "observe.ts"), {
  configFile: NodePath.resolve(import.meta.dirname, "../../../babel.config.js"),
  envName: "production",
  caller: { name: "metro", platform: "android", isDev: false, supportsStaticESM: false },
}).code;

it.each([undefined, ""])(
  "starts without loading the native observability SDK when the Expo project ID is %s",
  async (projectId) => {
    const module = { exports: {} } as { exports: typeof import("./observe") };
    expect(() =>
      NodeVM.runInNewContext(code, {
        module,
        exports: module.exports,
        require: (name: string) => {
          if (name.startsWith("@babel/runtime/")) return require(name);
          if (name === "expo-constants") {
            return {
              expoConfig: {
                extra: {
                  appVariant: "preview",
                  relay: { url: "https://relay.example.test" },
                  eas: { projectId },
                },
              },
            };
          }
          if (name === "expo-observe") {
            throw new Error("Project ID is required to send observability metrics.");
          }
          throw new Error(`Unexpected startup dependency: ${name}`);
        },
      }),
    ).not.toThrow();
    expect(module.exports.crashReportingAvailable).toBe(false);
    await module.exports.setCrashReportsEnabled(true);
    module.exports.reportRenderError(new Error("Render failed"));
  },
);
