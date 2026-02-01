import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchZoekt, listRepositories } from "./zoekt";
import { ZoektConfig } from "./types";

// Create server instance
const server = new McpServer({
    name: "zoekt-vscode",
    version: "0.0.1",
});

// Resource to check status
server.resource(
    "status",
    "zoekt://status",
    async (uri) => ({
        contents: [{
            uri: uri.href,
            text: JSON.stringify({
                status: "running",
                url: "http://127.0.0.1:6070"
            }, null, 2)
        }]
    })
);

// Register list repos tool
server.tool(
    "list_repos",
    "List all repositories available on the Zoekt server. Use this to find 'r:repo_name' filters.",
    {
        url: z.string().optional().describe("Zoekt server URL. Defaults to http://127.0.0.1:6070"),
    },
    async ({ url }) => {
        const searchUrl = url || "http://127.0.0.1:6070";
        const config: ZoektConfig = {
            url: searchUrl,
            prefixes: []
        };

        try {
            const repos = await listRepositories(config);
            if (repos.length === 0) {
                return {
                    content: [{ type: "text", text: "No repositories found." }]
                };
            }
            return {
                content: [{ type: "text", text: `Available Repositories:\n${repos.join('\n')}` }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error listing repos: ${error.message}` }],
                isError: true,
            };
        }
    }
);

// Register search tool
server.tool(
    "search",
    "Search code using Zoekt. STRONGLY PREFER REGEX.",
    {
        query: z.string().describe("The search query. USE REGEX for fuzzy matching! Example: '(init|setup).+context'. To filter by repo, use 'r:repo_name <query>'. Use 'list_repos' to find available repos."),
        prefix: z.string().optional().describe("Optional prefix to prepend to the query (e.g. 'r:my-repo')."),
        url: z.string().optional().describe("Zoekt server URL. Defaults to http://127.0.0.1:6070"),
    },
    async ({ query, prefix, url }) => {
        const searchUrl = url || "http://127.0.0.1:6070";

        // Use provided prefix if any
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
                    content: [{ type: "text", text: `No results found for query: ${fullQuery}` }]
                };
            }

            const fileCount = results.Result.FileCount;
            const matchCount = results.Result.MatchCount;

            let output = `Found ${matchCount} matches in ${fileCount} files (Query: ${fullQuery}).\n\n`;

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
