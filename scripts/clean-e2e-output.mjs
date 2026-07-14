import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const visualOutput = resolve(process.cwd(), "output", "playwright");

await rm(visualOutput, { force: true, recursive: true });
await mkdir(visualOutput, { recursive: true });
