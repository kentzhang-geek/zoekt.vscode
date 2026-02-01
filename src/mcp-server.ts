import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchZoekt } from "./zoekt";
import { ZoektConfig } from "./types";

// Create server instance
const server = new McpServer({
    name: "zoekt-vscode",
    version: "0.0.1",
});

// Register search tool
server.tool(
    "search",
    "Search code using Zoekt. Supports regex and Zoekt syntax.",
    {
        query: z.string().describe("The search query. Supports Zoekt syntax (e.g., 'defs:foo', 'r:bar', 'case:yes')."),
        prefix: z.string().optional().describe("Optional prefix to prepend to the query (e.g., 'r:my-repo')."),
        url: z.string().optional().describe("Zoekt server URL. Defaults to http://127.0.0.1:6070"),
    },
    async ({ query, prefix, url }) => {
        const searchUrl = url || "http://127.0.0.1:6070";
        const fullQuery = prefix ? `${prefix} ${query}` : query;

        // Construct a minimal config
        const config: ZoektConfig = {
            url: searchUrl,
            prefixes: []
        };

        try {
            const results = await searchZoekt(fullQuery, config);

            if (!results.Result || !results.Result.Files) {
                return {
                    content: [{ type: "text", text: "No results found." }]
                };
            }

            const fileCount = results.Result.FileCount;
            const matchCount = results.Result.MatchCount;

            let output = `Found ${matchCount} matches in ${fileCount} files.\n\n`;

            for (const file of results.Result.Files) {
                output += `File: ${file.FileName} (Repo: ${file.Repository})\n`;
                for (const match of file.LineMatches) {
                    output += `${match.LineNumber}: ${match.Line}\n`;
                }
                output += "\n";
            }

            return {
                content: [{ type: "text", text: output }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error searching zoekt: ${error.message}` }],
                isError: true,
            };
        }
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Zoekt MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
