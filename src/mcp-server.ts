import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchZoekt } from "./zoekt";
import { ZoektConfig } from "./types";

// Global state for persistence
let currentPrefix = "";
let currentPrefixName = "None";

// Predefined presets for common searches
const PRESETS: Record<string, string> = {
    "cpp": "f:\\.(cpp|c|cc|cxx|h|hpp|hxx)$",
    "hlsl": "f:\\.hlsl$",
    "shader": "f:\\.(shader|cg|hlsl|glsl|vsh|fsh)$"
};

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
                currentPrefix,
                currentPrefixName,
                availablePresets: Object.keys(PRESETS),
                url: "http://127.0.0.1:6070"
            }, null, 2)
        }]
    })
);

// Tool to set current prefix
server.tool(
    "set_prefix",
    "Set the search prefix (scope) for subsequent searches. Can use a preset name.",
    {
        prefix: z.string().describe(`The prefix string to use (e.g., 'r:my-repo') OR a preset name (${Object.keys(PRESETS).join(', ')}). Pass empty string to clear.`),
        name: z.string().optional().describe("A human-readable name for this prefix (e.g., 'My Repo').")
    },
    async ({ prefix, name }) => {
        // Check if prefix is a preset key
        if (prefix && PRESETS[prefix.toLowerCase()]) {
            const presetValue = PRESETS[prefix.toLowerCase()];
            currentPrefix = presetValue;
            currentPrefixName = name || `Preset: ${prefix}`;
            return {
                content: [{ type: "text", text: `Prefix set to preset '${prefix}': ${currentPrefix}` }]
            };
        }

        currentPrefix = prefix;
        currentPrefixName = name || (prefix ? prefix : "None");
        return {
            content: [{ type: "text", text: `Prefix set to: ${currentPrefixName} (${currentPrefix || "Global"})` }]
        };
    }
);

// Register search tool
server.tool(
    "search",
    "Search code using Zoekt. STRONGLY PREFER REGEX for vague queries.",
    {
        query: z.string().describe("The search query. USE REGEX for fuzzy matching! Example: '(init|setup).+context' is better than 'init setup context'. Supports Zoekt syntax (e.g., 'defs:foo', 'r:bar', 'case:yes')."),
        prefix: z.string().optional().describe("Optional prefix to override the global prefix (e.g., 'r:my-repo')."),
        url: z.string().optional().describe("Zoekt server URL. Defaults to http://127.0.0.1:6070"),
    },
    async ({ query, prefix, url }) => {
        const searchUrl = url || "http://127.0.0.1:6070";

        // Use provided prefix, or fallback to global state
        const effectivePrefix = prefix !== undefined ? prefix : currentPrefix;
        const fullQuery = effectivePrefix ? `${effectivePrefix} ${query}` : query;

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
