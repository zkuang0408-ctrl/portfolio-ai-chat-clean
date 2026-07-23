import { createRuntime } from "../src/chat/server/runtime.js";

let runtime: ReturnType<typeof createRuntime> | undefined;

export default {
  fetch(request: Request): Promise<Response> {
    runtime ??= createRuntime();
    return runtime.handle(request);
  },
};
