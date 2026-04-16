import { logger } from '@/ui/logger';
import { install as installMac } from './mac/install';
import { install as installWindows } from './windows/install';

export async function install(): Promise<void> {
    if (process.platform === 'win32') {
        logger.info('Installing Happy CLI autostart for Windows...');
        await installWindows();
        return;
    }

    if (process.platform !== 'darwin') {
        throw new Error('Daemon installation is currently supported on macOS and Windows only');
    }

    if (process.getuid && process.getuid() !== 0) {
        throw new Error('Daemon installation requires sudo privileges on macOS. Please run with sudo.');
    }

    logger.info('Installing Happy CLI daemon for macOS...');
    await installMac();
}
