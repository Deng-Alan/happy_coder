import chalk from 'chalk';
import { readCredentials } from '@/persistence';
import { ApiClient } from '@/api/api';
import { authenticateCodex } from './connect/authenticateCodex';
import { authenticateClaude } from './connect/authenticateClaude';
import { decodeJwtPayload } from './connect/utils';

/**
 * Handle connect subcommands for the personal edition.
 *
 * Only Claude and Codex are kept. Credentials are stored on the user's
 * self-hosted Happy server.
 */
export async function handleConnectCommand(args: string[]): Promise<void> {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showConnectHelp();
        return;
    }

    switch (subcommand.toLowerCase()) {
        case 'codex':
            await handleConnectVendor('codex', 'OpenAI Codex');
            break;
        case 'claude':
            await handleConnectVendor('claude', 'Claude');
            break;
        case 'status':
            await handleConnectStatus();
            break;
        default:
            console.error(chalk.red(`Unknown connect target: ${subcommand}`));
            showConnectHelp();
            process.exit(1);
    }
}

function showConnectHelp(): void {
    console.log(`
${chalk.bold('happy connect')} - Connect Claude / Codex to your personal server

${chalk.bold('Usage:')}
  happy connect codex        Store your Codex credential on your server
  happy connect claude       Store your Claude credential on your server
  happy connect status       Show connection status
  happy connect help         Show this help message

${chalk.bold('Description:')}
  The connect command stores your Claude / Codex credentials on your own
  self-hosted Happy server so your devices can share the same setup.

${chalk.bold('Examples:')}
  happy connect codex
  happy connect claude
  happy connect status

${chalk.bold('Notes:')} 
  • Pair this machine first (run 'happy auth login')
  • Credentials are encrypted before being stored on your own server
  • This personal edition only keeps Claude + Codex
`);
}

async function handleConnectVendor(vendor: 'codex' | 'claude', displayName: string): Promise<void> {
    console.log(chalk.bold(`\n🔌 Connecting ${displayName} to your personal server\n`));

    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  This machine is not paired yet'));
        console.log(chalk.gray('  Please run "happy auth login" first'));
        process.exit(1);
    }

    const api = await ApiClient.create(credentials);

    if (vendor === 'codex') {
        console.log('🚀 Registering Codex credential on server');
        const codexAuthTokens = await authenticateCodex();
        await api.registerVendorToken('openai', { oauth: codexAuthTokens });
        console.log('✅ Codex credential saved');
        process.exit(0);
    }

    console.log('🚀 Registering Claude credential on server');
    const anthropicAuthTokens = await authenticateClaude();
    await api.registerVendorToken('anthropic', { oauth: anthropicAuthTokens });
    console.log('✅ Claude credential saved');
    process.exit(0);
}

async function handleConnectStatus(): Promise<void> {
    console.log(chalk.bold('\n🔌 Connection Status\n'));

    const credentials = await readCredentials();
    if (!credentials) {
        console.log(chalk.yellow('⚠️  This machine is not paired yet'));
        console.log(chalk.gray('  Please run "happy auth login" first'));
        process.exit(1);
    }

    const api = await ApiClient.create(credentials);
    const vendors: Array<{ key: 'openai' | 'anthropic'; display: string }> = [
        { key: 'openai', display: 'OpenAI Codex' },
        { key: 'anthropic', display: 'Anthropic Claude' },
    ];

    for (const vendor of vendors) {
        try {
            const token = await api.getVendorToken(vendor.key);

            if (token?.oauth) {
                let userInfo = '';

                if (token.oauth.id_token) {
                    const payload = decodeJwtPayload(token.oauth.id_token);
                    if (payload?.email) {
                        userInfo = chalk.gray(` (${payload.email})`);
                    }
                }

                const expiresAt = token.oauth.expires_at || (token.oauth.expires_in ? Date.now() + token.oauth.expires_in * 1000 : null);
                const isExpired = expiresAt && expiresAt < Date.now();

                if (isExpired) {
                    console.log(`  ${chalk.yellow('⚠️')}  ${vendor.display}: ${chalk.yellow('expired')}${userInfo}`);
                } else {
                    console.log(`  ${chalk.green('✓')}  ${vendor.display}: ${chalk.green('connected')}${userInfo}`);
                }
            } else {
                console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
            }
        } catch {
            console.log(`  ${chalk.gray('○')}  ${vendor.display}: ${chalk.gray('not connected')}`);
        }
    }

    console.log('');
    console.log(chalk.gray('To connect a vendor, run: happy connect <vendor>'));
    console.log(chalk.gray('Example: happy connect claude'));
    console.log('');
}
