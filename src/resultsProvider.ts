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

    private cleanFilePath(repo: string, fileName: string): string {
        // Handle case where fileName contains absolute path (Zoekt internal behavior?)
        // Example: pbrtv3/src/D:\Code\pbrt-v3\src\tests\imageio.cpp
        // We look for a drive letter pattern or typical absolute path start.

        // Check for Windows drive letter D:\...
        const winMatch = fileName.match(/[a-zA-Z]:\\[^:]+$/);
        if (winMatch) {
            return winMatch[0];
        }

        // Just regular path
        return fileName;
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        const result = this.results[uri.toString()];
        if (!result) {
            return "Searching...";
        }

        if (!result.Result.Files || result.Result.Files.length === 0) {
            return "No matches found.";
        }

        let content = "";
        content += `Matches found: ${result.Result.MatchCount} in ${result.Result.FileCount} files\n\n`;

        for (const file of result.Result.Files) {
            const displayPath = this.cleanFilePath(file.Repository, file.FileName);
            content += `File: ${displayPath}\n`;
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
        const cleanedPath = this.cleanFilePath(repo, filePath);

        // If it looks like an absolute path, use it directly.
        if (cleanedPath.match(/^[a-zA-Z]:\\/) || cleanedPath.startsWith("/")) {
            return vscode.Uri.file(cleanedPath).with({ fragment: `L${line}` });
        }

        // Fallback: search in workspace
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const potentialUri = vscode.Uri.joinPath(folder.uri, cleanedPath);
                return potentialUri.with({ fragment: `L${line}` });
            }
        }
        return null;
    }
}
