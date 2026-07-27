import { createScfRuntime } from "./runtime.js";
import { createScfServer } from "./server.js";

const runtime = createScfRuntime();
const server = createScfServer(runtime);

server.listen(9000, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "portfolio_chat_server_ready",
    port: 9000,
  }));
});
