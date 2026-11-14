# Zoekt for VS Code

This extension connects VS Code to a [zoekt-webserver](https://github.com/sourcegraph/zoekt) RPC API (`-rpc` enabled) for fast trigram-based code search and jump.

## Features

- **Fast Search**: Query your Zoekt index from the Command Palette, the **Zoekt Search** sidebar toolbar, or the status bar.
- **Sidebar TreeView**: Results are grouped by `Search Query -> Repository -> File -> Line Match` in the **Zoekt Search** activity bar view.
- **Multi-Search History**:
  - New searches are inserted at the top and expanded automatically while older searches collapse.
  - Re-running an identical query refreshes it and moves it to the top.
  - Each search entry has inline **Refresh** (re-run in place) and **Close** (remove) buttons.
- **Match Highlights & Context Preview**: Matched fragments are highlighted in the tree; hovering over a match shows surrounding context lines (`Before` / `After`).
- **Quick Navigation**: Click any file or match line to jump directly to the exact line and column.
- **Repository & Prefix Filtering**: Pick a repository dynamically via `/api/list` or switch between configured query prefixes.

## Commands

- `Zoekt: Search` (`zoekt-vscode.search`): Open the search input box (remembers your last query).
- `Zoekt: Select Repository` (`zoekt-vscode.selectRepo`): Fetch indexed repositories from `/api/list` and set a repository filter.
- `Zoekt: Switch Prefix` (`zoekt-vscode.selectPrefix`): Switch between configured search prefixes.
- `Zoekt: Clear Results` (`zoekt-vscode.clearResults`): Clear all search results from the sidebar.

## Configuration

Add the following to your `settings.json`:

```json
{
    "zoekt.url": "http://127.0.0.1:6070",
    "zoekt.maxResults": 50,
    "zoekt.contextLines": 2,
    "zoekt.prefix": [
        { "name": "Current Repo", "prefix": "r:my-repo" },
        { "name": "All Data", "prefix": "" }
    ]
}
```

- `zoekt.url`: URL of your running `zoekt-webserver` (must be started with `-rpc`).
- `zoekt.maxResults`: Maximum number of matched files to return (`MaxDocDisplayCount`, default `50`).
- `zoekt.contextLines`: Number of context lines before and after each match (`NumContextLines`, `0`–`10`, default `2`).
- `zoekt.prefix`: Array of search scope presets (`{ "name": "...", "prefix": "..." }`).
