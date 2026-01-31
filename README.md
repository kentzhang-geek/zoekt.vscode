# Zoekt for VS Code

This extension allows you to connect to a local [zoekt-webserver](https://github.com/sourcegraph/zoekt) RPC API to perform fast trigram-based code searches directly from VS Code.

## Features

- **Fast Search**: Query your local Zoekt index instantly.
- **Results Buffer**: Search results are displayed in a read-only buffer with correct syntax highlighting (matches are shown with line numbers).
- **Quick Navigation**: Click on any file path in the results to jump directly to that file and line in your workspace.
- **Prefix Management**: configure multiple search scopes (prefixes) and switch between them easily.

## Commands

- `Zoekt: Search` (Ctrl+Shift+P -> `zoekt-vscode.search`): Open the search input.
- `Zoekt: Switch Prefix` (Ctrl+Shift+P -> `zoekt-vscode.selectPrefix`): Switch between configured search prefixes.

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
- `zoekt.prefix`: An array of search scopes. You can leave this empty if you don't use prefixes.
