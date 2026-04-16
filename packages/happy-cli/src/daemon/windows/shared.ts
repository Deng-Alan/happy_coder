import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';

export const WINDOWS_AUTOSTART_TASK_NAME = 'HappyCliDaemon';

function quoteWindowsArg(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
}

export function getCurrentUserTaskPrincipal(): string {
    const domain = process.env.USERDOMAIN;
    const username = process.env.USERNAME || os.userInfo().username;
    return domain ? `${domain}\\${username}` : username;
}

export function getWindowsAutostartCommand(): string {
    const runtimePath = process.execPath;
    const entrypoint = process.argv[1];

    if (!entrypoint || !existsSync(entrypoint)) {
        throw new Error(`Unable to locate Happy CLI entrypoint: ${entrypoint || 'missing argv[1]'}`);
    }

    return [
        quoteWindowsArg(runtimePath),
        '--no-warnings',
        '--no-deprecation',
        quoteWindowsArg(entrypoint),
        'daemon',
        'start-sync',
    ].join(' ');
}

export function runSchtasks(args: string[]): string {
    return execFileSync('schtasks', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
