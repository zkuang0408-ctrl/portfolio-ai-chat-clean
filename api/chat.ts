import { createVercelRuntime } from "../src/chat/server/vercel-runtime.js";

let runtime: ReturnType<typeof createVercelRuntime> | undefined;

export default {
  fetch(request: Request): Promise<Response> {
    runtime ??= createVercelRuntime();
    return runtime.handle(request);
  },
};
