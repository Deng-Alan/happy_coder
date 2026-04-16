export const PERSONAL_DEFAULT_SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://127.0.0.1:3005'
export const PERSONAL_DEFAULT_WEBAPP_URL = process.env.HAPPY_WEBAPP_URL || 'http://127.0.0.1:8081'

export const PERSONAL_SUPPORTED_AGENTS = ['claude', 'codex'] as const

export const DISABLED_PERSONAL_COMMANDS = new Set([
  'acp',
  'gemini',
  'notify',
  'openclaw',
])

export function getDisabledCommandMessage(command: string): string {
  return [
    `"happy ${command}" is disabled in this personal edition.`,
    'This fork is focused on Claude + Codex with your own self-hosted server.',
    'If you still need this command later, it can be re-enabled from the original implementation.',
  ].join('\n')
}
