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
 */
export async function getActiveBallerinaExtension(): Promise<vscode.Extension<any>> {
    const ext = getBallerinaExtension();
    if (!ext.isActive) {
        await ext.activate();
    }
    return ext;
}
