import { MMKV } from 'react-native-mmkv';
import { PERSONAL_DEFAULT_SERVER_URL } from '@/constants/personalEdition';

const serverConfigStorage = new MMKV({ id: 'server-config' });

const LEGACY_SERVER_KEY = 'custom-server-url';
const LOG_SERVER_KEY = 'log-server-url';
const PROFILE_KEY = 'server-profile-v1';
const DEFAULT_SERVER_URL = normalizeServerUrl(PERSONAL_DEFAULT_SERVER_URL);

export type ServerEndpointStatus = 'unknown' | 'healthy' | 'unhealthy';

export interface ServerEndpointHealth {
    status: ServerEndpointStatus;
    lastCheckedAt?: string;
    lastError?: string;
}

export interface ServerProfile {
    version: 1;
    lbEndpoint: string;
    backupEndpoints: string[];
    activeEndpoint: string;
    manualOverride: string | null;
    lastHealthyEndpoint: string | null;
    endpointHealth: Record<string, ServerEndpointHealth>;
}

export interface ServerInfo {
    hostname: string;
    port?: number;
    isCustom: boolean;
    activeUrl: string;
    activeLabel: string;
    configuredUrls: string[];
    usesBackup: boolean;
    manualOverride: string | null;
}

type ServerProfileListener = (profile: ServerProfile) => void;

const listeners = new Set<ServerProfileListener>();

function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const value of urls) {
        if (!value) {
            continue;
        }
        const url = normalizeServerUrl(value);
        if (!url || seen.has(url)) {
            continue;
        }
        seen.add(url);
        normalized.push(url);
    }

    return normalized;
}

function getEndpointLabel(index: number): string {
    if (index === 0) {
        return '美国节点';
    }
    if (index === 1) {
        return '香港节点';
    }
    return `备用节点 ${index + 1}`;
}

function createDefaultProfile(): ServerProfile {
    return {
        version: 1,
        lbEndpoint: DEFAULT_SERVER_URL,
        backupEndpoints: [],
        activeEndpoint: DEFAULT_SERVER_URL,
        manualOverride: null,
        lastHealthyEndpoint: DEFAULT_SERVER_URL,
        endpointHealth: {
            [DEFAULT_SERVER_URL]: { status: 'unknown' },
        },
    };
}

function sanitizeProfile(raw: Partial<ServerProfile> | null | undefined): ServerProfile {
    const defaultProfile = createDefaultProfile();
    const lbEndpoint = raw?.lbEndpoint ? normalizeServerUrl(raw.lbEndpoint) : defaultProfile.lbEndpoint;
    const backupEndpoints = uniqueUrls(raw?.backupEndpoints ?? []).filter((url) => url !== lbEndpoint);
    const configuredUrls = uniqueUrls([lbEndpoint, ...backupEndpoints]);

    const manualOverride = raw?.manualOverride ? normalizeServerUrl(raw.manualOverride) : null;
    const activeCandidate = raw?.activeEndpoint ? normalizeServerUrl(raw.activeEndpoint) : null;
    const lastHealthyCandidate = raw?.lastHealthyEndpoint ? normalizeServerUrl(raw.lastHealthyEndpoint) : null;

    const activeEndpoint = configuredUrls.includes(activeCandidate || '')
        ? activeCandidate!
        : configuredUrls.includes(lastHealthyCandidate || '')
            ? lastHealthyCandidate!
            : configuredUrls[0] || defaultProfile.activeEndpoint;

    const manualPinnedEndpoint = configuredUrls.includes(manualOverride || '') ? manualOverride : null;
    const endpointHealthEntries = raw?.endpointHealth ?? {};
    const endpointHealth = Object.fromEntries(
        configuredUrls.map((url) => {
            const existing = endpointHealthEntries[url];
            return [url, {
                status: existing?.status ?? 'unknown',
                ...(existing?.lastCheckedAt ? { lastCheckedAt: existing.lastCheckedAt } : {}),
                ...(existing?.lastError ? { lastError: existing.lastError } : {}),
            } satisfies ServerEndpointHealth];
        }),
    );

    return {
        version: 1,
        lbEndpoint,
        backupEndpoints,
        activeEndpoint,
        manualOverride: manualPinnedEndpoint,
        lastHealthyEndpoint: configuredUrls.includes(lastHealthyCandidate || '') ? lastHealthyCandidate : activeEndpoint,
        endpointHealth,
    };
}

function readStoredProfile(): ServerProfile {
    const rawProfile = serverConfigStorage.getString(PROFILE_KEY);
    if (rawProfile) {
        try {
            return sanitizeProfile(JSON.parse(rawProfile));
        } catch {
        }
    }

    const legacyUrl = serverConfigStorage.getString(LEGACY_SERVER_KEY);
    if (legacyUrl?.trim()) {
        return sanitizeProfile({
            lbEndpoint: legacyUrl,
            activeEndpoint: legacyUrl,
            lastHealthyEndpoint: legacyUrl,
        });
    }

    return createDefaultProfile();
}

function writeProfile(profile: ServerProfile): void {
    serverConfigStorage.set(PROFILE_KEY, JSON.stringify(profile));
    serverConfigStorage.delete(LEGACY_SERVER_KEY);
}

function notifyProfileListeners(profile: ServerProfile): void {
    listeners.forEach((listener) => listener(profile));
}

function updateProfile(
    updater: (current: ServerProfile) => ServerProfile,
    options: { notify?: boolean } = {},
): ServerProfile {
    const current = readStoredProfile();
    const next = sanitizeProfile(updater(current));
    writeProfile(next);

    if (options.notify !== false) {
        notifyProfileListeners(next);
    }

    return next;
}

export function subscribeServerProfile(listener: ServerProfileListener): () => void {
    listeners.add(listener);
    listener(getServerProfile());
    return () => listeners.delete(listener);
}

export function getServerProfile(): ServerProfile {
    return readStoredProfile();
}

export function getAllServerUrls(profile: ServerProfile = getServerProfile()): string[] {
    return uniqueUrls([
        profile.manualOverride,
        profile.activeEndpoint,
        profile.lbEndpoint,
        ...profile.backupEndpoints,
    ]);
}

export function getFailoverCandidates(currentUrl?: string): string[] {
    const profile = getServerProfile();
    const current = normalizeServerUrl(currentUrl || getServerUrl());
    const configuredUrls = uniqueUrls([profile.lbEndpoint, ...profile.backupEndpoints]).filter((url) => url !== current);

    return configuredUrls.sort((left, right) => {
        const leftStatus = profile.endpointHealth[left]?.status ?? 'unknown';
        const rightStatus = profile.endpointHealth[right]?.status ?? 'unknown';

        const score = (status: ServerEndpointStatus) => status === 'healthy' ? 2 : status === 'unknown' ? 1 : 0;
        return score(rightStatus) - score(leftStatus);
    });
}

export function getServerUrl(): string {
    const profile = getServerProfile();
    return normalizeServerUrl(profile.manualOverride || profile.activeEndpoint || profile.lbEndpoint || DEFAULT_SERVER_URL);
}

export function setServerProfile(input: {
    lbEndpoint?: string | null;
    backupEndpoints?: Array<string | null | undefined>;
    activeEndpoint?: string | null;
    manualOverride?: string | null;
} | null): void {
    if (!input) {
        resetServerProfile();
        return;
    }

    updateProfile((current) => ({
        ...current,
        ...(input.lbEndpoint ? { lbEndpoint: input.lbEndpoint } : {}),
        ...(input.backupEndpoints ? { backupEndpoints: input.backupEndpoints.filter((value): value is string => Boolean(value && value.trim())) } : {}),
        ...(input.activeEndpoint ? { activeEndpoint: input.activeEndpoint } : {}),
        manualOverride: input.manualOverride ?? null,
    }));
}

export function resetServerProfile(): void {
    const profile = createDefaultProfile();
    writeProfile(profile);
    notifyProfileListeners(profile);
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        const normalized = normalizeServerUrl(url);
        setServerProfile({
            lbEndpoint: normalized,
            backupEndpoints: [],
            activeEndpoint: normalized,
            manualOverride: null,
        });
        return;
    }

    resetServerProfile();
}

export function setActiveServerUrl(url: string, options: { manual?: boolean } = {}): void {
    const normalized = normalizeServerUrl(url);
    updateProfile((current) => {
        const configuredUrls = uniqueUrls([current.lbEndpoint, ...current.backupEndpoints]);
        if (!configuredUrls.includes(normalized)) {
            throw new Error(`Unknown configured server endpoint: ${normalized}`);
        }

        return {
            ...current,
            activeEndpoint: normalized,
            manualOverride: options.manual ? normalized : null,
            lastHealthyEndpoint: normalized,
            endpointHealth: {
                ...current.endpointHealth,
                [normalized]: {
                    status: 'healthy',
                    lastCheckedAt: new Date().toISOString(),
                },
            },
        };
    });
}

export function clearManualServerUrl(): void {
    updateProfile((current) => ({
        ...current,
        manualOverride: null,
        activeEndpoint: current.lbEndpoint || current.lastHealthyEndpoint || current.activeEndpoint,
    }));
}

export function markServerHealthy(url: string): void {
    const normalized = normalizeServerUrl(url);
    updateProfile((current) => ({
        ...current,
        activeEndpoint: normalized,
        manualOverride: current.manualOverride === normalized ? normalized : null,
        lastHealthyEndpoint: normalized,
        endpointHealth: {
            ...current.endpointHealth,
            [normalized]: {
                status: 'healthy',
                lastCheckedAt: new Date().toISOString(),
            },
        },
    }), { notify: false });
}

export function markServerUnhealthy(url: string, error?: string): void {
    const normalized = normalizeServerUrl(url);
    updateProfile((current) => ({
        ...current,
        manualOverride: current.manualOverride === normalized ? null : current.manualOverride,
        endpointHealth: {
            ...current.endpointHealth,
            [normalized]: {
                status: 'unhealthy',
                lastCheckedAt: new Date().toISOString(),
                ...(error ? { lastError: error } : {}),
            },
        },
    }), { notify: false });
}

export function getLogServerUrl(): string | null {
    return serverConfigStorage.getString(LOG_SERVER_KEY) ||
        process.env.EXPO_PUBLIC_LOG_SERVER_URL ||
        null;
}

export function setLogServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(LOG_SERVER_KEY, normalizeServerUrl(url));
    } else {
        serverConfigStorage.delete(LOG_SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    const profile = getServerProfile();
    return profile.lbEndpoint !== DEFAULT_SERVER_URL || profile.backupEndpoints.length > 0;
}

export function getServerEndpointEntries(profile: ServerProfile = getServerProfile()): Array<{
    key: string;
    label: string;
    url: string;
    isActive: boolean;
    isManual: boolean;
    status: ServerEndpointStatus;
}> {
    const entries = [
        {
            key: 'lb',
            label: '统一入口',
            url: profile.lbEndpoint,
        },
        ...profile.backupEndpoints.map((url, index) => ({
            key: `backup-${index}`,
            label: getEndpointLabel(index),
            url,
        })),
    ];

    return entries.map((entry) => ({
        ...entry,
        isActive: entry.url === getServerUrl(),
        isManual: profile.manualOverride === entry.url,
        status: profile.endpointHealth[entry.url]?.status ?? 'unknown',
    }));
}

export function getServerInfo(): ServerInfo {
    const url = getServerUrl();
    const profile = getServerProfile();
    const activeUrl = url;
    const configuredUrls = getAllServerUrls(profile);
    const usesBackup = activeUrl !== profile.lbEndpoint;

    try {
        const parsed = new URL(url);
        return {
            hostname: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port, 10) : undefined,
            isCustom: isUsingCustomServer(),
            activeUrl,
            activeLabel: usesBackup ? '备用节点' : '统一入口',
            configuredUrls,
            usesBackup,
            manualOverride: profile.manualOverride,
        };
    } catch {
        return {
            hostname: url,
            port: undefined,
            isCustom: isUsingCustomServer(),
            activeUrl,
            activeLabel: usesBackup ? '备用节点' : '统一入口',
            configuredUrls,
            usesBackup,
            manualOverride: profile.manualOverride,
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}
