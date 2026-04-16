import { logger } from '@/ui/logger';
import { getCurrentUserTaskPrincipal, getWindowsAutostartCommand, runSchtasks, WINDOWS_AUTOSTART_TASK_NAME } from './shared';

export async function install(): Promise<void> {
    const taskCommand = getWindowsAutostartCommand();
    const principal = getCurrentUserTaskPrincipal();

    try {
        runSchtasks(['/Delete', '/TN', WINDOWS_AUTOSTART_TASK_NAME, '/F']);
    } catch {
    }

    runSchtasks([
        '/Create',
        '/SC', 'ONLOGON',
        '/TN', WINDOWS_AUTOSTART_TASK_NAME,
        '/TR', taskCommand,
        '/RL', 'LIMITED',
        '/RU', principal,
        '/F',
    ]);

    logger.info(`Windows 开机自启已安装，计划任务名: ${WINDOWS_AUTOSTART_TASK_NAME}`);
}
