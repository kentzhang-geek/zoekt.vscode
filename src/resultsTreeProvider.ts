import * as path from 'path';
import * as vscode from 'vscode';
import { FileMatch, LineFragmentMatch, LineMatch, ZoektSearchResult } from './types';

/**
 * @brief Node representing a repository group in the search results tree.
 */
interface RepoNode {
	kind: 'repo';
	repository: string;
	files: FileMatch[];
	matchCount: number;
}

/**
 * @brief Node representing a matched file under a repository.
 */
interface FileNode {
	kind: 'file';
	fileMatch: FileMatch;
	uri: vscode.Uri | undefined;
}

/**
 * @brief Node representing a single line match within a file.
 */
interface MatchNode {
	kind: 'match';
	fileMatch: FileMatch;
	lineMatch: LineMatch;
	uri: vscode.Uri | undefined;
}

/**
 * @brief Union type of all nodes rendered in the Zoekt search results tree.
 */
export type ZoektTreeNode = RepoNode | FileNode | MatchNode;

/**
 * @brief Arguments passed to the openResult command when a match is clicked.
 */
export interface OpenResultArgs {
	uri: vscode.Uri;
	lineNumber: number;
	startChar?: number;
	endChar?: number;
}

/**
 * @brief Converts a UTF-8 byte offset within a line into a UTF-16 JS string index.
 * @param line Full line text.
 * @param byteOffset Zero-based byte offset into UTF-8 representation.
 * @return Corresponding UTF-16 code unit index, clamped to line length.
 */
function utf8ByteOffsetToCharIndex(line: string, byteOffset: number): number {
	if (byteOffset <= 0) {
		return 0;
	}
	const buf = Buffer.from(line, 'utf-8');
	const clamped = Math.min(byteOffset, buf.length);
	return buf.subarray(0, clamped).toString('utf-8').length;
}

/**
 * @brief Resolves a Zoekt FileName into a local VS Code file Uri.
 * @param filePath File path returned by Zoekt (typically absolute in the fork).
 * @return Resolved file Uri, or undefined if no valid path can be determined.
 */
export function resolveFileUri(filePath: string): vscode.Uri | undefined {
	const winDriveMatch = filePath.match(/[a-zA-Z]:[\\/][^:]+$/);
	if (winDriveMatch) {
		return vscode.Uri.file(winDriveMatch[0]);
	}

	if (filePath.startsWith('/')) {
		return vscode.Uri.file(filePath);
	}

	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		return vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filePath);
	}

	return undefined;
}

/**
 * @brief TreeDataProvider rendering Zoekt search results grouped by repository and file.
 */
export class ZoektResultTreeProvider implements vscode.TreeDataProvider<ZoektTreeNode> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ZoektTreeNode | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private repoNodes: RepoNode[] = [];
	private lastQuery = '';
	private lastResult: ZoektSearchResult | undefined;

	/**
	 * @brief Updates the tree with a new search result and refreshes the view.
	 * @param query Query string that produced the result.
	 * @param result Parsed ZoektSearchResult from /api/search.
	 */
	public setResults(query: string, result: ZoektSearchResult): void {
		this.lastQuery = query;
		this.lastResult = result;

		const grouped = new Map<string, FileMatch[]>();
		const files = result.Result?.Files ?? [];

		for (const file of files) {
			const repoName = file.Repository || '(unknown)';
			const list = grouped.get(repoName) ?? [];
			list.push(file);
			grouped.set(repoName, list);
		}

		this.repoNodes = Array.from(grouped.entries()).map(([repository, repoFiles]) => {
			let matchCount = 0;
			for (const f of repoFiles) {
				matchCount += Math.max(f.LineMatches?.length ?? 0, 1);
			}
			return {
				kind: 'repo',
				repository,
				files: repoFiles,
				matchCount
			};
		});

		this._onDidChangeTreeData.fire();
	}

	/**
	 * @brief Clears all stored search results and refreshes the tree.
	 */
	public clear(): void {
		this.repoNodes = [];
		this.lastQuery = '';
		this.lastResult = undefined;
		this._onDidChangeTreeData.fire();
	}

	/**
	 * @brief Builds a concise status summary for the TreeView header message.
	 * @return Summary string, or undefined if no search has been executed.
	 */
	public getSummaryMessage(): string | undefined {
		if (!this.lastResult) {
			return undefined;
		}
		const r = this.lastResult.Result;
		const filesSkipped = r.FilesSkipped ?? 0;
		const skippedNote = filesSkipped > 0 ? ` (${filesSkipped} skipped)` : '';
		return `"${this.lastQuery}" — ${r.MatchCount} matches in ${r.FileCount} files${skippedNote}`;
	}

	/**
	 * @brief Returns the VS Code TreeItem representation for a given node.
	 * @param element Tree node to render.
	 * @return Configured vscode.TreeItem.
	 */
	public getTreeItem(element: ZoektTreeNode): vscode.TreeItem {
		if (element.kind === 'repo') {
			const item = new vscode.TreeItem(element.repository, vscode.TreeItemCollapsibleState.Expanded);
			item.description = `${element.files.length} files, ${element.matchCount} matches`;
			item.iconPath = new vscode.ThemeIcon('repo');
			item.contextValue = 'zoektRepo';
			return item;
		}

		if (element.kind === 'file') {
			const normalized = element.fileMatch.FileName.replace(/\\/g, '/');
			const baseName = path.posix.basename(normalized);
			const dirName = path.posix.dirname(normalized);
			const hasMatches = (element.fileMatch.LineMatches?.length ?? 0) > 0;

			const item = new vscode.TreeItem(
				baseName,
				hasMatches ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
			);
			item.description = dirName === '.' ? '' : dirName;
			item.tooltip = element.fileMatch.FileName;
			item.resourceUri = element.uri;
			item.iconPath = vscode.ThemeIcon.File;
			item.contextValue = 'zoektFile';

			if (element.uri) {
				const args: OpenResultArgs = {
					uri: element.uri,
					lineNumber: element.fileMatch.LineMatches?.[0]?.LineNumber ?? 1
				};
				item.command = {
					command: 'zoekt-vscode.openResult',
					title: 'Open File',
					arguments: [args]
				};
			}
			return item;
		}

		return this.buildMatchTreeItem(element);
	}

	/**
	 * @brief Returns child nodes for the given parent node, or root repo nodes if undefined.
	 * @param element Parent node or undefined for root.
	 * @return Array of child ZoektTreeNode items.
	 */
	public getChildren(element?: ZoektTreeNode): ZoektTreeNode[] {
		if (!element) {
			return this.repoNodes;
		}

		if (element.kind === 'repo') {
			return element.files.map(fileMatch => ({
				kind: 'file',
				fileMatch,
				uri: resolveFileUri(fileMatch.FileName)
			}));
		}

		if (element.kind === 'file') {
			return (element.fileMatch.LineMatches ?? []).map(lineMatch => ({
				kind: 'match',
				fileMatch: element.fileMatch,
				lineMatch,
				uri: element.uri
			}));
		}

		return [];
	}

	/**
	 * @brief Constructs a TreeItem for a single line match with highlight ranges and context tooltip.
	 * @param element MatchNode containing line text, fragments, and context.
	 * @return Configured vscode.TreeItem.
	 */
	private buildMatchTreeItem(element: MatchNode): vscode.TreeItem {
		const { lineMatch, uri } = element;
		const rawLine = lineMatch.Line.replace(/\r?\n$/, '');
		const leadingSpaces = rawLine.length - rawLine.trimStart().length;
		const trimmedLine = rawLine.trimStart();

		const prefix = `${lineMatch.LineNumber}: `;
		const labelText = `${prefix}${trimmedLine}`;

		const highlights: Array<[number, number]> = [];
		let firstStartChar: number | undefined;
		let firstEndChar: number | undefined;

		if (Array.isArray(lineMatch.LineFragments)) {
			for (const frag of lineMatch.LineFragments) {
				const rawStart = utf8ByteOffsetToCharIndex(rawLine, frag.LineOffset);
				const rawEnd = utf8ByteOffsetToCharIndex(rawLine, frag.LineOffset + frag.MatchLength);
				if (firstStartChar === undefined) {
					firstStartChar = rawStart;
					firstEndChar = rawEnd;
				}
				const adjStart = Math.max(0, rawStart - leadingSpaces) + prefix.length;
				const adjEnd = Math.max(0, rawEnd - leadingSpaces) + prefix.length;
				if (adjEnd > adjStart && adjEnd <= labelText.length) {
					highlights.push([adjStart, adjEnd]);
				}
			}
		}

		const item = new vscode.TreeItem({ label: labelText, highlights }, vscode.TreeItemCollapsibleState.None);
		item.tooltip = this.buildContextTooltip(lineMatch, rawLine);
		item.contextValue = 'zoektMatch';

		if (uri) {
			const args: OpenResultArgs = {
				uri,
				lineNumber: Math.max(1, lineMatch.LineNumber),
				startChar: firstStartChar,
				endChar: firstEndChar
			};
			item.command = {
				command: 'zoekt-vscode.openResult',
				title: 'Open Match',
				arguments: [args]
			};
		}

		return item;
	}

	/**
	 * @brief Formats Before/Line/After context lines into a Markdown tooltip.
	 * @param lineMatch Matched line data including optional Before and After context.
	 * @param rawLine Matched line without trailing newline.
	 * @return MarkdownString tooltip for hover preview.
	 */
	private buildContextTooltip(lineMatch: LineMatch, rawLine: string): vscode.MarkdownString {
		const parts: string[] = [];
		if (lineMatch.Before) {
			parts.push(lineMatch.Before.replace(/\r?\n$/, ''));
		}
		parts.push(`> ${rawLine}`);
		if (lineMatch.After) {
			parts.push(lineMatch.After.replace(/\r?\n$/, ''));
		}
		const md = new vscode.MarkdownString();
		md.appendCodeblock(parts.join('\n'), 'text');
		return md;
	}
}
