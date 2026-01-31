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
        console.log(`[Zoekt] Provider updating ${uri.toString()} with ${result.Result.MatchCount} matches`);
        this.results[uri.toString()] = result;
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        const result = this.results[uri.toString()];
        if (!result) {
            return "Searching...";
        }

        // Adapted for flattened structure, using 'Files' key
        if (!result.Result.Files || result.Result.Files.length === 0) {
            return "No matches found.";
        }

        let content = "";
        content += `Matches found: ${result.Result.MatchCount} in ${result.Result.FileCount} files\n\n`;

        for (const file of result.Result.Files) {
            content += `File: ${file.Repository}/${file.FileName}\n`;
            for (const match of file.LineMatches) {
                // LineNumber
                content += `  ${match.LineNumber}: ${match.Line}\n`;
            }
            content += "\n";
        }

        return content;
    }

    provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
        const links: vscode.DocumentLink[] = [];
        const result = this.results[document.uri.toString()];

        // Check for Files instead of FileMatches
        if (!result || !result.Result.Files) {
            return links;
        }

        const lines = document.getText().split('\n');

        let fileIndex = 0;
        let currentFileMatch: FileMatch | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith("File: ")) {
                if (fileIndex < result.Result.Files.length) {
                    currentFileMatch = result.Result.Files[fileIndex];
                    fileIndex++;

                    const start = line.indexOf(":") + 2;
                    const range = new vscode.Range(i, start, i, line.length);

                    const target = this.resolveFileUri(currentFileMatch.Repository, currentFileMatch.FileName);
                    if (target) {
                        links.push(new vscode.DocumentLink(range, target));
                    }
                }
            } else if (line.trim().match(/^\d+:/)) {
                if (currentFileMatch) {
                    const matchRes = line.trim().match(/^(\d+):/);
                    if (matchRes) {
                        const lineNum = parseInt(matchRes[1]);
                        const start = line.indexOf(matchRes[1]);
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
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const potentialUri = vscode.Uri.joinPath(folder.uri, filePath);
                return potentialUri.with({ fragment: `L${line}` });
            }
        }
        return null;
    }
}
