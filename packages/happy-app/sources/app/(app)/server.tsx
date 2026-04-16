import React from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { RoundButton } from '@/components/RoundButton';
import { Modal } from '@/modal';
import { layout } from '@/components/layout';
import { t } from '@/text';
import {
    clearManualServerUrl,
    getServerEndpointEntries,
    getServerInfo,
    getServerProfile,
    resetServerProfile,
    setActiveServerUrl,
    setServerProfile,
    subscribeServerProfile,
    validateServerUrl,
} from '@/sync/serverConfig';
import { apiSocket } from '@/sync/apiSocket';
import { sync } from '@/sync/sync';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const stylesheet = StyleSheet.create((theme) => ({
    keyboardAvoidingView: {
        flex: 1,
    },
    itemListContainer: {
        flex: 1,
    },
    contentContainer: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
    },
    labelText: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginTop: 8,
    },
    textInput: {
        backgroundColor: theme.colors.input.background,
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        ...Typography.mono(),
        fontSize: 14,
        color: theme.colors.input.text,
    },
    textInputValidating: {
        opacity: 0.6,
    },
    errorText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textDestructive,
        marginBottom: 12,
    },
    validatingText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.status.connecting,
        marginBottom: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        marginBottom: 12,
    },
    buttonWrapper: {
        flex: 1,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
}));

type HealthPayload = {
    status?: string;
    service?: string;
};

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export default function ServerConfigScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const [profile, setProfileState] = React.useState(() => getServerProfile());
    const [lbUrl, setLbUrl] = React.useState(profile.lbEndpoint);
    const [usUrl, setUsUrl] = React.useState(profile.backupEndpoints[0] ?? '');
    const [hkUrl, setHkUrl] = React.useState(profile.backupEndpoints[1] ?? '');
    const [error, setError] = React.useState<string | null>(null);
    const [isValidating, setIsValidating] = React.useState(false);

    React.useEffect(() => subscribeServerProfile((nextProfile) => {
        setProfileState(nextProfile);
        setLbUrl(nextProfile.lbEndpoint);
        setUsUrl(nextProfile.backupEndpoints[0] ?? '');
        setHkUrl(nextProfile.backupEndpoints[1] ?? '');
    }), []);

    const serverInfo = getServerInfo();
    const endpointEntries = getServerEndpointEntries(profile);

    const validateEndpoint = React.useCallback(async (url: string, label: string): Promise<void> => {
        const validation = validateServerUrl(url);
        if (!validation.valid) {
            throw new Error(`${label}：${validation.error || '地址格式错误'}`);
        }

        const response = await fetch(joinUrl(url, '/health'), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`${label}：健康检查失败`);
        }

        let payload: HealthPayload | null = null;
        try {
            payload = await response.json() as HealthPayload;
        } catch {
        }

        if (payload?.status !== 'ok' || payload?.service !== 'happy-server') {
            throw new Error(`${label}：不是有效的 Happy Personal Server`);
        }
    }, []);

    const reconnectClients = React.useCallback(async () => {
        apiSocket.reconnectToConfiguredEndpoint();
        await sync.reconnectAppSyncStore();
        await Promise.allSettled([
            sync.refreshSessions(),
            sync.refreshMachines(),
        ]);
    }, []);

    const handleSave = React.useCallback(async () => {
        const nextLbUrl = lbUrl.trim();
        const nextUsUrl = usUrl.trim();
        const nextHkUrl = hkUrl.trim();

        if (!nextLbUrl) {
            Modal.alert('错误', '请先填写统一入口地址（LB 域名或主地址）');
            return;
        }

        try {
            setIsValidating(true);
            setError(null);

            await validateEndpoint(nextLbUrl, '统一入口');
            if (nextUsUrl) {
                await validateEndpoint(nextUsUrl, '美国节点');
            }
            if (nextHkUrl) {
                await validateEndpoint(nextHkUrl, '香港节点');
            }

            const confirmed = await Modal.confirm(
                '保存服务器配置',
                '保存后会立即重连到新的服务器配置。',
                { confirmText: '保存并重连', destructive: true },
            );

            if (!confirmed) {
                return;
            }

            setServerProfile({
                lbEndpoint: nextLbUrl,
                backupEndpoints: [nextUsUrl, nextHkUrl],
                activeEndpoint: nextLbUrl,
                manualOverride: null,
            });

            await reconnectClients();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : '保存失败');
        } finally {
            setIsValidating(false);
        }
    }, [hkUrl, lbUrl, reconnectClients, usUrl, validateEndpoint]);

    const handleReset = React.useCallback(async () => {
        const confirmed = await Modal.confirm(
            '重置服务器配置',
            '将恢复到默认服务器地址，并清空主备节点配置。',
            { confirmText: '重置', destructive: true },
        );

        if (!confirmed) {
            return;
        }

        resetServerProfile();
        await reconnectClients();
    }, [reconnectClients]);

    const handleSwitch = React.useCallback(async (url: string) => {
        try {
            setIsValidating(true);
            setError(null);
            setActiveServerUrl(url, { manual: true });
            await reconnectClients();
        } catch (switchError) {
            setError(switchError instanceof Error ? switchError.message : '切换失败');
        } finally {
            setIsValidating(false);
        }
    }, [reconnectClients]);

    const handleAutoRoute = React.useCallback(async () => {
        try {
            setIsValidating(true);
            setError(null);
            clearManualServerUrl();
            await reconnectClients();
        } catch (switchError) {
            setError(switchError instanceof Error ? switchError.message : '恢复自动切换失败');
        } finally {
            setIsValidating(false);
        }
    }, [reconnectClients]);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('server.serverConfiguration'),
                    headerBackTitle: t('common.back'),
                }}
            />

            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ItemList style={styles.itemListContainer}>
                    <ItemGroup title="当前连接" footer="推荐把统一入口填成 Cloudflare LB 域名，再把美国/香港节点作为客户端兜底地址。">
                        <Item
                            title="活跃地址"
                            subtitle={serverInfo.activeUrl}
                            detail={serverInfo.activeLabel}
                            showChevron={false}
                        />
                        <Item
                            title="切换模式"
                            subtitle={profile.manualOverride ? '手动固定到当前节点' : '自动优先统一入口，异常时自动切到备用节点'}
                            showChevron={false}
                        />
                    </ItemGroup>

                    <ItemGroup title="节点配置">
                        <View style={styles.contentContainer}>
                            <Text style={styles.labelText}>统一入口（必填）</Text>
                            <TextInput
                                style={[styles.textInput, isValidating && styles.textInputValidating]}
                                value={lbUrl}
                                onChangeText={(text) => {
                                    setLbUrl(text);
                                    setError(null);
                                }}
                                placeholder="https://api.example.com"
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                editable={!isValidating}
                            />

                            <Text style={styles.labelText}>美国节点（可选）</Text>
                            <TextInput
                                style={[styles.textInput, isValidating && styles.textInputValidating]}
                                value={usUrl}
                                onChangeText={(text) => {
                                    setUsUrl(text);
                                    setError(null);
                                }}
                                placeholder="https://us-api.example.com"
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                editable={!isValidating}
                            />

                            <Text style={styles.labelText}>香港节点（可选）</Text>
                            <TextInput
                                style={[styles.textInput, isValidating && styles.textInputValidating]}
                                value={hkUrl}
                                onChangeText={(text) => {
                                    setHkUrl(text);
                                    setError(null);
                                }}
                                placeholder="https://hk-api.example.com"
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                editable={!isValidating}
                            />

                            {error ? (
                                <Text style={styles.errorText}>{error}</Text>
                            ) : null}
                            {isValidating ? (
                                <Text style={styles.validatingText}>正在验证并重连服务器...</Text>
                            ) : null}

                            <View style={styles.buttonRow}>
                                <View style={styles.buttonWrapper}>
                                    <RoundButton
                                        title="恢复默认"
                                        size="normal"
                                        display="inverted"
                                        onPress={handleReset}
                                    />
                                </View>
                                <View style={styles.buttonWrapper}>
                                    <RoundButton
                                        title={isValidating ? '处理中...' : '保存'}
                                        size="normal"
                                        action={handleSave}
                                        disabled={isValidating}
                                    />
                                </View>
                            </View>

                            <Text style={styles.statusText}>
                                保存后会立即刷新 App 连接；如果你配置了双节点，后续切换会尽量无感完成。
                            </Text>
                        </View>
                    </ItemGroup>

                    <ItemGroup title="手动切换" footer="临时切换后，如果节点故障，App 仍会自动尝试其它可用地址。">
                        {endpointEntries.map((entry) => (
                            <Item
                                key={entry.key}
                                title={entry.label}
                                subtitle={entry.url}
                                detail={entry.isActive ? (entry.isManual ? '当前（手动）' : '当前') : undefined}
                                onPress={entry.isActive ? undefined : () => { void handleSwitch(entry.url); }}
                                showChevron={!entry.isActive}
                            />
                        ))}
                        <Item
                            title="恢复自动路由"
                            subtitle="优先统一入口，失败后自动尝试备用节点"
                            onPress={() => { void handleAutoRoute(); }}
                        />
                    </ItemGroup>
                </ItemList>
            </KeyboardAvoidingView>
        </>
    );
}
