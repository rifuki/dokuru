import path from "node:path";
import { fileURLToPath } from "node:url";
import { Generator, getConfig } from "@tanstack/router-generator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = getConfig(
  {
    target: "react",
    autoCodeSplitting: true,
  },
  root
);

await new Generator({ config, root }).run();
