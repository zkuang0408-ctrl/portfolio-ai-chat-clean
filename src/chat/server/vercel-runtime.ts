import { ipAddress as vercelIpAddress } from "@vercel/functions/headers";

import { createRuntime } from "./runtime.js";

export function createVercelRuntime() {
  return createRuntime({
    env: process.env,
    ipAddress: (request) => vercelIpAddress(request),
  });
}
