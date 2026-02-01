# Zoekt for VS Code

This extension allows you to connect to a local [zoekt-webserver](https://github.com/sourcegraph/zoekt) RPC API to perform fast trigram-based code searches directly from VS Code.

## Features

- **Fast Search**: Query your local Zoekt index instantly.
- **Results Buffer**: Search results are displayed in a read-only buffer with correct syntax highlighting.
- **Quick Navigation**: Click on any file path in the results to jump directly to that file.
- **MCP Server**: Built-in Model Context Protocol server for AI assistants (e.g. Claude).
- **AI Tools**: Exposes tools to VS Code's Language Model API (GitHub Copilot).

## Commands

- `Zoekt: Search` (Ctrl+Shift+P -> `zoekt-vscode.search`): Open the search input.
- `Zoekt: Switch Prefix` (Ctrl+Shift+P -> `zoekt-vscode.selectPrefix`): Switch between configured search prefixes.
- `Zoekt: Show MCP Config`: Display the configuration needed to connect an MCP client.

## Configuration

Add the following to your `settings.json`:

```json
{
    "zoekt.url": "http://127.0.0.1:6070",
    "zoekt.prefix": [
        { "name": "Current Repo", "prefix": "r:my-repo" },
        { "name": "All Data", "prefix": "" }
    ]
}
```

- `zoekt.url`: The URL of your running `zoekt-webserver`.
- `zoekt.prefix`: An array of search scopes for the manual search command.

## AI & MCP Integration

This extension exposes your local Zoekt index to AI agents, allowing them to perform semantic-aware code searches (via Regex) across your entire codebase.

### MCP Server (e.g. for Claude Desktop)

The extension includes a built-in MCP server. To use it:
1. Run `Zoekt: Show MCP Config` in VS Code.
2. Copy the generated config into your MCP Client's configuration (e.g., `claude_desktop_config.json`).

**Tools Provided:**
- **`list_repos`**: Lists all repositories available on the Zoekt server.
- **`search`**: Searches the codebase. 
  - Supports **Regex** (e.g., `(init|setup).*context`).
  - Supports **Repo Filtering** via `r:` prefix (e.g., `r:my-repo defs:MyClass`).
  - *Note: The AI decides which repo to search based on your prompt.*

### VS Code LM API (e.g. for Copilot)

If you use AI extensions in VS Code (like Copilot Chat), this extension provides tools they can automatically call:

- **`zoekt_list_repos`**: Discover available repositories.
- **`zoekt_search`**: Perform regex searches across the codebase.

The agents are instructed to use `zoekt_search` with aggressive regex usage and repo filtering for precise context retrieval.
