"use strict";
// Never executed at runtime. Listed in pkg.scripts so that @yao-pkg/pkg's
// static analyser bundles these deps into the host exe — they are exposed to
// the app layer (server.js, run.js, etc.) via global.__hostRequire.
require("playwright");
require("keytar");
require("semver");
require("@modelcontextprotocol/sdk/server/index.js");
require("@modelcontextprotocol/sdk/server/stdio.js");
require("@modelcontextprotocol/sdk/types.js");
