import { logger } from '@/ui/logger';
import { uninstall as uninstallMac } from './mac/uninstall';
import { uninstall as uninstallWindows } from './windows/uninstall';

export async function uninstall(): Promise<void> {
    if (process.platform === 'win32') {
        logger.info('Uninstalling Happy CLI autostart for Windows...');
        await uninstallWindows();
        return;
    }

    if (process.platform !== 'darwin') {
        throw new Error('Daemon uninstallation is currently supported on macOS and Windows only');
    }

    if (process.getuid && process.getuid() !== 0) {
        throw new Error('Daemon uninstallation requires sudo privileges on macOS. Please run with sudo.');
    }

    logger.info('Uninstalling Happy CLI daemon for macOS...');
    await uninstallMac();
}
