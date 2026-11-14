import * as path from 'path';
import * as vscode from 'vscode';
import { FileMatch, LineMatch, ZoektSearchResult } from './types';

/**
 * @brief Root node representing a single search execution and its results.
 */
export interface SearchNode {
	kind: 'search';
	id: string;
	stateVersion: number;
	fullQuery: string;
	repos: RepoNode[];
	matchCount: number;
	fileCount: number;
	filesSkipped: number;
	timestamp: string;
	expanded: boolean;
}

/**
 * @brief Node representing a repository group under a search result.
 */
interface RepoNode {
	kind: 'repo';
	searchId: string;
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
export type ZoektTreeNode = SearchNode | RepoNode | FileNode | MatchNode;

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
 * @brief Formats current local time as HH:MM:SS for search history labels.
 * @return Formatted timestamp string.
 */
function formatTimeNow(): string {
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

/**
 * @brief Groups flat FileMatch results into RepoNode items for a SearchNode.
 * @param searchId Parent SearchNode identifier.
 * @param result Parsed ZoektSearchResult from /api/search.
 * @return Array of RepoNode items.
 */
function buildRepoNodes(searchId: string, result: ZoektSearchResult): RepoNode[] {
	const grouped = new Map<string, FileMatch[]>();
	const files = result.Result?.Files ?? [];

	for (const file of files) {
		const repoName = file.Repository || '(unknown)';
		const list = grouped.get(repoName) ?? [];
		list.push(file);
		grouped.set(repoName, list);
	}

	return Array.from(grouped.entries()).map(([repository, repoFiles]) => {
		let matchCount = 0;
		for (const f of repoFiles) {
			matchCount += Math.max(f.LineMatches?.length ?? 0, 1);
		}
		return {
			kind: 'repo',
			searchId,
			repository,
			files: repoFiles,
			matchCount
		};
	});
}

/**
 * @brief TreeDataProvider managing multiple Zoekt search sessions grouped by query, repository, and file.
 */
export class ZoektResultTreeProvider implements vscode.TreeDataProvider<ZoektTreeNode> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ZoektTreeNode | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private searchNodes: SearchNode[] = [];
	private nextId = 1;

	/**
	 * @brief Inserts a new search result at the top, or refreshes and moves an existing identical query to the top.
	 * @param fullQuery Full query string executed against Zoekt.
	 * @param result Parsed ZoektSearchResult from /api/search.
	 */
	public addOrMoveToTop(fullQuery: string, result: ZoektSearchResult): void {
		for (const node of this.searchNodes) {
			if (node.expanded) {
				node.expanded = false;
				node.stateVersion++;
			}
		}

		const existingIdx = this.searchNodes.findIndex(n => n.fullQuery === fullQuery);
		const r = result.Result;

		if (existingIdx >= 0) {
			const [existing] = this.searchNodes.splice(existingIdx, 1);
			existing.repos = buildRepoNodes(existing.id, result);
			existing.matchCount = r.MatchCount ?? 0;
			existing.fileCount = r.FileCount ?? 0;
			existing.filesSkipped = r.FilesSkipped ?? 0;
			existing.timestamp = formatTimeNow();
			existing.expanded = true;
			existing.stateVersion++;
			this.searchNodes.unshift(existing);
		} else {
			const id = `search-${this.nextId++}`;
			const newNode: SearchNode = {
				kind: 'search',
				id,
				stateVersion: 1,
				fullQuery,
				repos: buildRepoNodes(id, result),
				matchCount: r.MatchCount ?? 0,
				fileCount: r.FileCount ?? 0,
				filesSkipped: r.FilesSkipped ?? 0,
				timestamp: formatTimeNow(),
				expanded: true
			};
			this.searchNodes.unshift(newNode);
		}

		this._onDidChangeTreeData.fire();
	}

	/**
	 * @brief Refreshes an existing SearchNode in-place without changing its position in the list.
	 * @param nodeId Identifier of the SearchNode to update.
	 * @param result Fresh ZoektSearchResult from /api/search.
	 */
	public refreshNode(nodeId: string, result: ZoektSearchResult): void {
		const node = this.searchNodes.find(n => n.id === nodeId);
		if (!node) {
			return;
		}
		const r = result.Result;
		node.repos = buildRepoNodes(node.id, result);
		node.matchCount = r.MatchCount ?? 0;
		node.fileCount = r.FileCount ?? 0;
		node.filesSkipped = r.FilesSkipped ?? 0;
		node.timestamp = formatTimeNow();
		this._onDidChangeTreeData.fire(node);
	}

	/**
	 * @brief Removes a single SearchNode from the tree.
	 * @param nodeId Identifier of the SearchNode to remove.
	 */
	public deleteNode(nodeId: string): void {
		const idx = this.searchNodes.findIndex(n => n.id === nodeId);
		if (idx < 0) {
			return;
		}
		this.searchNodes.splice(idx, 1);
		this._onDidChangeTreeData.fire();
	}

	/**
	 * @brief Clears all stored search results and refreshes the tree.
	 */
	public clear(): void {
		this.searchNodes = [];
		this._onDidChangeTreeData.fire();
	}

	/**
	 * @brief Builds a concise status summary for the TreeView header message.
	 * @return Summary string, or undefined if no search sessions exist.
	 */
	public getSummaryMessage(): string | undefined {
		if (this.searchNodes.length === 0) {
			return undefined;
		}
		const latest = this.searchNodes[0];
		const skippedNote = latest.filesSkipped > 0 ? ` (${latest.filesSkipped} skipped)` : '';
		return `${this.searchNodes.length} search(es) — latest: "${latest.fullQuery}" (${latest.matchCount} matches in ${latest.fileCount} files${skippedNote})`;
	}

	/**
	 * @brief Returns the VS Code TreeItem representation for a given node.
	 * @param element Tree node to render.
	 * @return Configured vscode.TreeItem.
	 */
	public getTreeItem(element: ZoektTreeNode): vscode.TreeItem {
		if (element.kind === 'search') {
			const hasRepos = element.repos.length > 0;
			const collapsible = hasRepos
				? (element.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
				: vscode.TreeItemCollapsibleState.None;
			const item = new vscode.TreeItem(element.fullQuery, collapsible);
			item.id = `${element.id}:${element.stateVersion}`;
			const skipped = element.filesSkipped > 0 ? `, ${element.filesSkipped} skipped` : '';
			item.description = `${element.matchCount} matches in ${element.fileCount} files${skipped} · ${element.timestamp}`;
			item.tooltip = `Query: ${element.fullQuery}\nMatches: ${element.matchCount} in ${element.fileCount} files${skipped}\nTime: ${element.timestamp}`;
			item.iconPath = new vscode.ThemeIcon('search');
			item.contextValue = 'zoektSearch';
			return item;
		}

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
	 * @brief Returns child nodes for the given parent node, or root search nodes if undefined.
	 * @param element Parent node or undefined for root.
	 * @return Array of child ZoektTreeNode items.
	 */
	public getChildren(element?: ZoektTreeNode): ZoektTreeNode[] {
		if (!element) {
			return this.searchNodes;
		}

		if (element.kind === 'search') {
			return element.repos;
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
