import { createRuntime } from "./runtime.js";

export function createVercelRuntime() {
  return createRuntime({ env: process.env });
}
