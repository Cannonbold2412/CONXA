"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// package.json lives at conxa-execute/, not electron/ (Studio's script is one level shallower).
const root = path.join(__dirname, "..", "..");
const rendererUrl = process.env.CONXA_RENDERER_URL || "http://localhost:5175";

function waitForRenderer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Renderer did not start at " + url));
          return;
        }
        setTimeout(tryOnce, 250);
      });
      req.setTimeout(800, () => {
        req.destroy();
      });
    };
    tryOnce();
  });
}

(async () => {
  await waitForRenderer(rendererUrl, 60_000);

  const env = {
    ...process.env,
    CONXA_RENDERER_URL: rendererUrl,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(process.execPath, [require.resolve("electron/cli"), "."], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: false,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
