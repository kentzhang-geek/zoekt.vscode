import * as vscode from 'vscode';
import { getConfig } from './config';
import { listRepositories, searchZoekt } from './zoekt';
import { OpenResultArgs, SearchNode, ZoektResultTreeProvider } from './resultsTreeProvider';

const STATE_PREFIX = 'zoekt.activePrefix';
const STATE_PREFIX_NAME = 'zoekt.activePrefixName';
const STATE_REPO = 'zoekt.activeRepo';
const STATE_LAST_QUERY = 'zoekt.lastQuery';

/**
 * @brief Escapes special regular expression characters for exact Zoekt repo filter matching.
 * @param value Raw repository name.
 * @return Regex-escaped repository name.
 */
function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @brief Updates the status bar item to reflect the active prefix and repository scope.
 * @param statusBar Target VS Code status bar item.
 * @param context Extension context holding workspace state.
 */
function updateStatusBar(statusBar: vscode.StatusBarItem, context: vscode.ExtensionContext): void {
	const prefixName = context.workspaceState.get<string>(STATE_PREFIX_NAME, '');
	const activeRepo = context.workspaceState.get<string>(STATE_REPO, '');

	const scopes: string[] = [];
	if (activeRepo) {
		scopes.push(activeRepo);
	}
	if (prefixName && prefixName !== 'None (All)') {
		scopes.push(prefixName);
	}

	statusBar.text = scopes.length > 0 ? `$(search) Zoekt: ${scopes.join(' | ')}` : '$(search) Zoekt';
	statusBar.tooltip = 'Click to run Zoekt Search';
}

/**
 * @brief Activates the Zoekt VS Code extension for human code search.
 * @param context VS Code extension context for registering disposables and state.
 */
export function activate(context: vscode.ExtensionContext): void {
	const treeProvider = new ZoektResultTreeProvider();
	const treeView = vscode.window.createTreeView('zoektResults', {
		treeDataProvider: treeProvider,
		showCollapseAll: true
	});

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.command = 'zoekt-vscode.search';
	updateStatusBar(statusBar, context);
	statusBar.show();

	const selectPrefixCommand = vscode.commands.registerCommand('zoekt-vscode.selectPrefix', async () => {
		const config = getConfig();
		if (!config.prefixes || config.prefixes.length === 0) {
			vscode.window.showInformationMessage("No prefixes configured in 'zoekt.prefix'.");
			return;
		}

		const items = config.prefixes.map(p => ({
			label: p.name,
			description: p.prefix,
			prefix: p.prefix
		}));
		items.unshift({ label: 'None (All)', description: '', prefix: '' });

		const selection = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a search scope/prefix'
		});

		if (selection) {
			await context.workspaceState.update(STATE_PREFIX, selection.prefix);
			await context.workspaceState.update(STATE_PREFIX_NAME, selection.label);
			updateStatusBar(statusBar, context);
		}
	});

	const selectRepoCommand = vscode.commands.registerCommand('zoekt-vscode.selectRepo', async () => {
		const config = getConfig();
		try {
			const repos = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Fetching Zoekt repositories...',
					cancellable: false
				},
				() => listRepositories(config)
			);

			const items = [
				{ label: 'All Repositories', description: 'Clear repository filter', repo: '' },
				...repos.map(repo => ({ label: repo, description: `r:^${escapeRegex(repo)}$`, repo }))
			];

			const selection = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a Zoekt repository filter'
			});

			if (selection) {
				await context.workspaceState.update(STATE_REPO, selection.repo);
				updateStatusBar(statusBar, context);
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to list Zoekt repositories: ${msg}`);
		}
	});

	const searchCommand = vscode.commands.registerCommand('zoekt-vscode.search', async () => {
		const config = getConfig();
		const prefix = context.workspaceState.get<string>(STATE_PREFIX, '');
		const activeRepo = context.workspaceState.get<string>(STATE_REPO, '');
		const lastQuery = context.workspaceState.get<string>(STATE_LAST_QUERY, '');

		const scopeParts: string[] = [];
		if (activeRepo) {
			scopeParts.push(`r:^${escapeRegex(activeRepo)}$`);
		}
		if (prefix) {
			scopeParts.push(prefix);
		}
		const scopeText = scopeParts.join(' ');

		const query = await vscode.window.showInputBox({
			value: lastQuery,
			valueSelection: lastQuery ? [0, lastQuery.length] : undefined,
			placeHolder: 'Search query (e.g. "foo bar" or "file:\\.ts$ func")',
			title: 'Zoekt Search',
			prompt: scopeText ? `Active scope: ${scopeText}` : 'Enter Zoekt query (no active scope)'
		});

		if (!query) {
			return;
		}

		await context.workspaceState.update(STATE_LAST_QUERY, query);
		const fullQuery = scopeText ? `${scopeText} ${query}` : query;

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Zoekt: Searching "${fullQuery}"...`,
					cancellable: false
				},
				async () => {
					const result = await searchZoekt(fullQuery, config);
					treeProvider.addOrMoveToTop(fullQuery, result);
					treeView.message = treeProvider.getSummaryMessage();
					await vscode.commands.executeCommand('zoektResults.focus');
				}
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Zoekt search failed: ${msg}`);
		}
	});

	const clearResultsCommand = vscode.commands.registerCommand('zoekt-vscode.clearResults', () => {
		treeProvider.clear();
		treeView.message = undefined;
	});

	const refreshSearchCommand = vscode.commands.registerCommand('zoekt-vscode.refreshSearch', async (node?: SearchNode) => {
		if (!node || node.kind !== 'search') {
			return;
		}
		const config = getConfig();
		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Zoekt: Refreshing "${node.fullQuery}"...`,
					cancellable: false
				},
				async () => {
					const result = await searchZoekt(node.fullQuery, config);
					treeProvider.refreshNode(node.id, result);
					treeView.message = treeProvider.getSummaryMessage();
				}
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Zoekt refresh failed: ${msg}`);
		}
	});

	const deleteSearchCommand = vscode.commands.registerCommand('zoekt-vscode.deleteSearch', (node?: SearchNode) => {
		if (!node || node.kind !== 'search') {
			return;
		}
		treeProvider.deleteNode(node.id);
		treeView.message = treeProvider.getSummaryMessage();
	});

	const openResultCommand = vscode.commands.registerCommand('zoekt-vscode.openResult', async (args: OpenResultArgs) => {
		if (!args?.uri) {
			return;
		}
		const lineIndex = Math.max(0, (args.lineNumber ?? 1) - 1);
		const startCol = Math.max(0, args.startChar ?? 0);
		const endCol = Math.max(startCol, args.endChar ?? startCol);
		const selection = new vscode.Range(lineIndex, startCol, lineIndex, endCol);

		const doc = await vscode.workspace.openTextDocument(args.uri);
		const editor = await vscode.window.showTextDocument(doc, {
			preserveFocus: false,
			selection
		});
		editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
	});

	context.subscriptions.push(
		treeView,
		statusBar,
		selectPrefixCommand,
		selectRepoCommand,
		searchCommand,
		clearResultsCommand,
		refreshSearchCommand,
		deleteSearchCommand,
		openResultCommand
	);
}

/**
 * @brief Deactivates the Zoekt VS Code extension.
 */
export function deactivate(): void {
	// No explicit teardown required; disposables are registered on context.subscriptions.
}
