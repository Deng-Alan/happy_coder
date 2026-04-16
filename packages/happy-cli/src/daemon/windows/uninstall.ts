import { logger } from '@/ui/logger';
import { runSchtasks, WINDOWS_AUTOSTART_TASK_NAME } from './shared';

export async function uninstall(): Promise<void> {
    try {
        runSchtasks(['/Delete', '/TN', WINDOWS_AUTOSTART_TASK_NAME, '/F']);
        logger.info(`Windows 开机自启已移除，计划任务名: ${WINDOWS_AUTOSTART_TASK_NAME}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ERROR: The system cannot find the file specified')) {
            logger.info(`Windows 开机自启不存在，无需移除: ${WINDOWS_AUTOSTART_TASK_NAME}`);
            return;
        }
        throw error;
    }
}
