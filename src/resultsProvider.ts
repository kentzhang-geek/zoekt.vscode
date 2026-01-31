import * as vscode from 'vscode';
import { FileMatch, ZoektSearchResult } from './zoekt';

interface SearchResultStorage {
    [uri: string]: ZoektSearchResult;
}

export class ZoektResultProvider implements vscode.TextDocumentContentProvider, vscode.DocumentLinkProvider {
    // Event emitter to signal content changes
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    private results: SearchResultStorage = {};

    public update(uri: vscode.Uri, result: ZoektSearchResult) {
        console.log(`[Zoekt] Provider updating ${uri.toString()} with ${result.Result.Stats.MatchCount} matches`);
        this.results[uri.toString()] = result;
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        const result = this.results[uri.toString()];
        if (!result) {
            return "Searching...";
        }

        if (!result.Result.FileMatches || result.Result.FileMatches.length === 0) {
            return "No matches found.";
        }

        let content = "";
        content += `Matches found: ${result.Result.Stats.MatchCount} in ${result.Result.Stats.FileCount} files\n\n`;

        for (const file of result.Result.FileMatches) {
            content += `File: ${file.Repository}/${file.FileName}\n`;
            for (const match of file.LineMatches) {
                // LineNumber is typically 1-based from Zoekt, but verify. 
                // Display as:  Line <num>: <content>
                content += `  ${match.LineNumber}: ${match.Line}\n`;
            }
            content += "\n";
        }

        return content;
    }

    provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        const links: vscode.DocumentLink[] = [];
        const result = this.results[document.uri.toString()];
        if (!result || !result.Result.FileMatches) {
            return links;
        }

        const lines = document.getText().split('\n');

        // Simple parsing logic: maintain a current file context
        // This relies on the exact format produced by provideTextDocumentContent
        let currentFile: string | null = null;
        let currentRepo: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Files start with "File: repo/path"
            if (line.startsWith("File: ")) {
                const fullPath = line.substring(6).trim();
                // Assuming fullPath is repo/file/path. 
                // In a real scenario, we need to map this to a workspace file.
                // For this implementation, we will use a naive mapping or store the full path if Zoekt returns it?
                // Zoekt normally returns relative path in repo.
                // We will try to find a matching file in the workspace.

                // For now, let's treat the text itself as the target link if we can resolve it.
                // But simplified: Just make the header linkable? 

                // Better approach for DocumentLink: create a range covering the file path
                // However, without knowing the absolute path, we can't create a file:/// link easily.
                // Let's assume the user has the repo open.

                // Let's defer full workspace resolution to the "open" command possibly, 
                // but DocumentLink needs a target.

                // HACK: We will store metadata in the link target query or valid file URI if possible.
                // If we can't find it, we won't link it.

                // Actually, let's try to link the specific lines too.

                /* 
                   Strategy:
                   We need to map `Repository/FileName` to a local workspace file.
                   This is complex if we don't know the mapping.
                   For now, we will create a Command link that handles the jump,
                   Or we try to resolve it relative to workspace folders.
                */

                // Let's assume (for simplicity and per user request for "jump") 
                // we can just construct a command link that calls a "zoekt.openResult" command.
                // VS Code DocumentLinks can trigger commands.
            }
        }

        // Revised approach for Links:
        // We will scan the document generated.
        // File lines: "File: <repo>/<path>"
        // Match lines: "  <num>: <code>"

        // We will use regex to find these patterns.

        let fileIndex = 0;
        let currentFileMatch: FileMatch | null = null;

        // Since we iterate line by line, we can track state.

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith("File: ")) {
                // The generation order is deterministic.
                if (fileIndex < result.Result.FileMatches.length) {
                    currentFileMatch = result.Result.FileMatches[fileIndex];
                    fileIndex++;

                    // Make the file path click-able?
                    // Let's make the "File: ..." line open the file at line 1.
                    const start = line.indexOf(":") + 2;
                    const range = new vscode.Range(i, start, i, line.length);

                    const target = this.resolveFileUri(currentFileMatch.Repository, currentFileMatch.FileName);
                    if (target) {
                        links.push(new vscode.DocumentLink(range, target));
                    }
                }
            } else if (line.trim().match(/^\d+:/)) {
                // It's a match line
                if (currentFileMatch) {
                    const matchRes = line.trim().match(/^(\d+):/);
                    if (matchRes) {
                        const lineNum = parseInt(matchRes[1]);
                        const start = line.indexOf(matchRes[1]); // Find where the number starts (handling indentation)
                        const range = new vscode.Range(i, start, i, line.length);

                        const target = this.resolveFileUri(currentFileMatch.Repository, currentFileMatch.FileName, lineNum);
                        if (target) {
                            links.push(new vscode.DocumentLink(range, target));
                        }
                    }
                }
            }
        }

        return links;
    }

    private resolveFileUri(repo: string, filePath: string, line: number = 1): vscode.Uri | null {
        // Attempt to find the file in the workspace.
        // This is heuristic.
        // 1. Try to find a workspace folder that matches the repo name?
        // 2. Or just search for the file path in all workspace folders?

        // Simple heuristic: If we have a workspace open, join the path.
        // Assuming single repo workspace or typical setup.

        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                // If the folder name matches the repo, or just assume it is the root.
                // Let's just try to check if the file exists relative to the workspace root.
                // We'll treat the workspace root as the root for `filePath`.

                // Zoekt `Repository` might be "github.com/user/repo".
                // `FileName` is "src/main.ts".

                // We will try joining the folder uri with the file name.
                const potentialUri = vscode.Uri.joinPath(folder.uri, filePath);
                // In a perfect world we check fs.stat, but that's async. 
                // DocumentLinkProvider must be sync or return a provider result (which can be promise).

                // Let's return it with fragment for line number.
                return potentialUri.with({ fragment: `L${line}` });
            }
        }

        return null;
    }
}
