import type { NewSessionAgentType } from '@/sync/persistence';

export const PERSONAL_DEFAULT_SERVER_URL =
    process.env.EXPO_PUBLIC_HAPPY_SERVER_URL ||
    process.env.EXPO_PUBLIC_SERVER_URL ||
    'http://127.0.0.1:3005';

export const PERSONAL_SUPPORTED_AGENTS: NewSessionAgentType[] = ['claude', 'codex'];

export function isPersonalSupportedAgent(agentType: string | null | undefined): agentType is NewSessionAgentType {
    return agentType === 'claude' || agentType === 'codex';
}
