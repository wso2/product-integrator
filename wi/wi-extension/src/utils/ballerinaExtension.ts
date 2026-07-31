import * as vscode from 'vscode';

/**
 * Return the Ballerina extension if present, otherwise undefined.
 */
export function findBallerinaExtension(): vscode.Extension<any> | undefined {
    return vscode.extensions.getExtension('wso2.ballerina');
}

/**
 * Return the Ballerina extension or throw if not installed.
 */
export function getBallerinaExtension(): vscode.Extension<any> {
    const ext = findBallerinaExtension();
    if (!ext) {
        throw new Error('Ballerina extension not found');
    }
    return ext;
}

/**
 * Ensure the Ballerina extension is activated and return it.
 *
 * NOTE: `activate()` on the Ballerina extension resolves late — its `activate` awaits the
 * whole state machine (language server start, project info, project structure). Callers
 * that only need a command to exist should use {@link waitForBallerinaCommand} instead.
 */
export async function getActiveBallerinaExtension(): Promise<vscode.Extension<any>> {
    const ext = getBallerinaExtension();
    if (!ext.isActive) {
        await ext.activate();
    }
    return ext;
}

/** Poll interval while waiting for a Ballerina command to be registered. Tight at first
 *  (the command normally appears within a few hundred ms of activation starting), then
 *  relaxed so a genuinely missing command does not spin hot for the whole timeout. */
const COMMAND_POLL_FAST_INTERVAL_MS = 50;
const COMMAND_POLL_SLOW_INTERVAL_MS = 250;
const COMMAND_POLL_FAST_WINDOW_MS = 2_000;
/** Upper bound on that wait before we give up and report the extension as unusable. */
const COMMAND_WAIT_TIMEOUT_MS = 60_000;

/**
 * Resolve once `commandId` is registered by the Ballerina extension, triggering its
 * activation if needed.
 *
 * Deliberately does NOT await `activate()`: that promise settles only when the language
 * server is up and the project has been scanned, which is many seconds on a cold start —
 * and never at all when initialization fails. Commands registered early in the extension's
 * `activate` are usable long before that, so we start activation and watch the command
 * registry instead. Activation failures are still surfaced rather than swallowed.
 */
export async function waitForBallerinaCommand(commandId: string): Promise<void> {
    const ext = getBallerinaExtension();

    let activationError: unknown;
    if (!ext.isActive) {
        // Intentionally not awaited — see above. The catch keeps a failed activation from
        // becoming an unhandled rejection and lets the loop below report the real cause.
        Promise.resolve(ext.activate()).catch((error) => {
            activationError = error ?? new Error('Ballerina extension activation failed.');
        });
    }

    const startedAt = Date.now();
    for (;;) {
        if ((await vscode.commands.getCommands(true)).includes(commandId)) {
            return;
        }
        if (activationError) {
            throw activationError;
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed >= COMMAND_WAIT_TIMEOUT_MS) {
            throw new Error(
                `The Ballerina extension did not register "${commandId}". ` +
                'Ensure it is installed and up to date.',
            );
        }
        const interval = elapsed < COMMAND_POLL_FAST_WINDOW_MS
            ? COMMAND_POLL_FAST_INTERVAL_MS
            : COMMAND_POLL_SLOW_INTERVAL_MS;
        await new Promise((resolve) => setTimeout(resolve, interval));
    }
}
