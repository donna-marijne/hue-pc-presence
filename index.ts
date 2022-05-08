#!/usr/bin/env node

import { HueBridge } from "./hue-bridge";
import { hostname } from "os";
import { argv } from "process";

(async () => {
  try {
    const args = argv.slice(2);
    const state = args[0] === "on";

    const hueBridge = await HueBridge.discover();
    await hueBridge.connect();
    await hueBridge.setPresence(hostname(), state);
  } catch (err) {
    console.error(err);
  }
})();
