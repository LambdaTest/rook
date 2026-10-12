// Shared stdio MCP server setup. Uses the SDK's low-level Server with plain
// JSON Schemas, so no schema library is needed. stdout carries the protocol,
// so anything human-readable goes to stderr.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const MOCK_API_URL = process.env.MOCK_API_URL ?? "http://127.0.0.1:9200";

export const log = (name, message) => console.error(`[${name}] ${message}`);

export const textResult = (text) => ({ content: [{ type: "text", text }] });

export const errorResult = (text) => ({ content: [{ type: "text", text }], isError: true });

/**
 * tools: { [name]: { description, inputSchema, outputSchema?, handler(args, extra) } }
 */
export async function serveTools(name, tools) {
  const server = new Server({ name, version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([toolName, { description, inputSchema, outputSchema }]) => ({
      name: toolName,
      description,
      inputSchema,
      ...(outputSchema ? { outputSchema } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name: toolName, arguments: args = {} } = request.params;
    const tool = tools[toolName];
    if (!tool) return errorResult(`Unknown tool: ${toolName}`);
    log(name, `call ${toolName} ${JSON.stringify(args)}`);
    try {
      return await tool.handler(args, extra);
    } catch (err) {
      log(name, `${toolName} failed: ${err.message}`);
      return errorResult(`${toolName} failed: ${err.message}`);
    }
  });

  await server.connect(new StdioServerTransport());
  log(name, `ready with tools: ${Object.keys(tools).join(", ")}`);
}
