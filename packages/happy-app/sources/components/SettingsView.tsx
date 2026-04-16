import { View, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { getServerInfo, getServerUrl } from '@/sync/serverConfig';
import { Modal } from '@/modal';
import { useMultiClick } from '@/hooks/useMultiClick';
import { useAllMachines, useLocalSettingMutable } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';

export const SettingsView = React.memo(function SettingsView() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const [devModeEnabled, setDevModeEnabled] = useLocalSettingMutable('devModeEnabled');
    const allMachines = useAllMachines();
    const serverInfo = getServerInfo();
    const serverUrl = getServerUrl();

    const { connectTerminal, connectWithUrl, isLoading } = useConnectTerminal();

    const handleReportIssue = async () => {
        await Modal.alert(
            '使用帮助',
            '这是你的个人版。如果遇到问题，优先检查手机日志、CLI 输出和自托管服务器日志。'
        );
    };

    const handleVersionClick = useMultiClick(() => {
        const newDevMode = !devModeEnabled;
        setDevModeEnabled(newDevMode);
        Modal.alert(
            t('modals.developerMode'),
            newDevMode ? t('modals.developerModeEnabled') : t('modals.developerModeDisabled')
        );
    }, {
        requiredClicks: 10,
        resetTimeout: 2000
    });

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
                <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.colors.surface, marginTop: 16, borderRadius: 12, marginHorizontal: 16 }}>
                    <Image
                        source={theme.dark ? require('@/assets/images/logotype-light.png') : require('@/assets/images/logotype-dark.png')}
                        contentFit="contain"
                        style={{ width: 300, height: 90, marginBottom: 12 }}
                    />
                </View>
            </View>

            {Platform.OS !== 'web' && (
                <ItemGroup title="终端 CLI">
                    <Item
                        title="扫描二维码连接手机"
                        subtitle="扫描 happy CLI 显示的二维码，把这台手机连接到你的电脑。"
                        icon={<Ionicons name="qr-code-outline" size={29} color="#007AFF" />}
                        onPress={connectTerminal}
                        loading={isLoading}
                        showChevron={false}
                    />
                    <Item
                        title="手动粘贴连接链接"
                        subtitle="如果不方便扫码，可以直接粘贴终端里的连接链接。"
                        icon={<Ionicons name="link-outline" size={29} color="#007AFF" />}
                        onPress={async () => {
                            const url = await Modal.prompt(
                                '连接终端',
                                '粘贴终端里显示的连接链接',
                                {
                                    placeholder: 'happy://terminal?...',
                                    confirmText: '连接'
                                }
                            );
                            if (url?.trim()) {
                                connectWithUrl(url.trim());
                            }
                        }}
                        showChevron={false}
                    />
                </ItemGroup>
            )}

            <ItemGroup title="服务器">
                <Item
                    title="服务器配置"
                    subtitle={serverInfo.isCustom ? serverUrl : '当前使用个人版默认地址；如果手机连不上电脑，请在这里改成你的局域网地址。'}
                    icon={<Ionicons name="server-outline" size={29} color="#34C759" />}
                    onPress={() => router.push('/server')}
                />
                <Item
                    title="当前地址"
                    detail={serverInfo.port ? `${serverInfo.hostname}:${serverInfo.port}` : serverInfo.hostname}
                    subtitle={serverInfo.isCustom ? '自定义自托管服务器' : '内置默认地址'}
                    icon={<Ionicons name="globe-outline" size={29} color="#5856D6" />}
                    showChevron={false}
                />
            </ItemGroup>

            {allMachines.length > 0 && (
                <ItemGroup title="机器">
                    {[...allMachines].map((machine) => {
                        const isOnline = isMachineOnline(machine);
                        const host = machine.metadata?.host || '未知主机';
                        const machineDisplayName = machine.metadata?.displayName;
                        const platform = machine.metadata?.platform || '';
                        const title = machineDisplayName || host;

                        let subtitle = '';
                        if (machineDisplayName && machineDisplayName !== host) {
                            subtitle = host;
                        }
                        if (platform) {
                            subtitle = subtitle ? `${subtitle} - ${platform}` : platform;
                        }
                        subtitle = subtitle ? `${subtitle} - ${isOnline ? t('status.online') : t('status.offline')}` : (isOnline ? t('status.online') : t('status.offline'));

                        return (
                            <Item
                                key={machine.id}
                                title={title}
                                subtitle={subtitle}
                                icon={
                                    <Ionicons
                                        name="desktop-outline"
                                        size={29}
                                        color={isOnline ? theme.colors.status.connected : theme.colors.status.disconnected}
                                    />
                                }
                                onPress={() => router.push(`/machine/${machine.id}`)}
                            />
                        );
                    })}
                </ItemGroup>
            )}

            <ItemGroup title="工作区">
                <Item
                    title="本机身份"
                    subtitle="查看当前个人身份、备份密钥、已连接设备和模型服务。"
                    icon={<Ionicons name="person-circle-outline" size={29} color="#007AFF" />}
                    onPress={() => router.push('/settings/account')}
                />
                <Item
                    title={t('settings.appearance')}
                    subtitle={t('settings.appearanceSubtitle')}
                    icon={<Ionicons name="color-palette-outline" size={29} color="#5856D6" />}
                    onPress={() => router.push('/settings/appearance')}
                />
                <Item
                    title={t('settings.featuresTitle')}
                    subtitle="个人版本地高级选项。"
                    icon={<Ionicons name="flask-outline" size={29} color="#FF9500" />}
                    onPress={() => router.push('/settings/features')}
                />
            </ItemGroup>

            {(__DEV__ || devModeEnabled) && (
                <ItemGroup title={t('settings.developer')}>
                    <Item
                        title={t('settings.developerTools')}
                        icon={<Ionicons name="construct-outline" size={29} color="#5856D6" />}
                        onPress={() => router.push('/dev')}
                    />
                </ItemGroup>
            )}

            <ItemGroup title={t('settings.about')} footer="这个个人版以 App 和 CLI 为主，Web 端只是辅助。">
                <Item
                    title="使用帮助"
                    icon={<Ionicons name="bug-outline" size={29} color="#FF3B30" />}
                    onPress={handleReportIssue}
                />
                <Item
                    title={t('common.version')}
                    detail={appVersion}
                    icon={<Ionicons name="information-circle-outline" size={29} color={theme.colors.textSecondary} />}
                    onPress={handleVersionClick}
                    showChevron={false}
                />
            </ItemGroup>
        </ItemList>
    );
});
