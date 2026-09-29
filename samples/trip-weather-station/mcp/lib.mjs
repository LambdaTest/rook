/**
 * The smallest MCP server that is still a real one.
 *
 * Newline-delimited JSON-RPC 2.0 over stdio, which is what the stdio servers in
 * the wild speak. Kept in one file so a reader can see the whole protocol at
 * once. `call` may be sync or async (this station's weather tools await network),
 * so the result is always resolved before it is sent back.
 */
export function serve({ tools, call, name = "trip-weather-station" }) {
  let buffer = "";
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

  process.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }

      if (message.method === "initialize") {
        send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name, version: "1.0.0" } } });
      } else if (message.method === "tools/list") {
        send({ jsonrpc: "2.0", id: message.id, result: { tools } });
      } else if (message.method === "tools/call") {
        Promise.resolve()
          .then(() => call(message.params.name, message.params.arguments ?? {}))
          .then((text) => send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text }] } }))
          // A tool reporting its own failure is an answer, not a transport error —
          // "this trip is private" or "that window is unsafe" is worth knowing.
          .catch((err) => send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: err.message }], isError: true } }));
      }
    }
  });
}
