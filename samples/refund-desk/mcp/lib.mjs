/**
 * The smallest MCP server that is still a real one.
 *
 * Newline-delimited JSON-RPC 2.0 over stdio, which is what the stdio servers
 * in the wild speak. Kept in one file so a reader can see the whole protocol
 * at once rather than following it through a framework.
 */
export function serve({ tools, call }) {
  let buffer = "";

  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

  process.stdin.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (message.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "sample", version: "1.0.0" },
          },
        });
      } else if (message.method === "tools/list") {
        send({ jsonrpc: "2.0", id: message.id, result: { tools } });
      } else if (message.method === "tools/call") {
        try {
          const text = call(message.params.name, message.params.arguments ?? {});
          send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text }] } });
        } catch (err) {
          // A tool reporting its own failure is an answer, not a transport
          // error — "no such order" is frequently the thing worth knowing.
          send({
            jsonrpc: "2.0",
            id: message.id,
            result: { content: [{ type: "text", text: err.message }], isError: true },
          });
        }
      }
    }
  });
}
