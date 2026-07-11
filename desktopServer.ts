import index from "./index.html";

type StartMessage = { type: "start"; port: number };

self.addEventListener("message", (event: MessageEvent<StartMessage>) => {
  const message = event.data;
  if (message.type !== "start") return;

  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: message.port,
      routes: {
        "/": index,
      },
    });

    self.postMessage({ type: "ready", port: server.port });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", message });
  }
});
