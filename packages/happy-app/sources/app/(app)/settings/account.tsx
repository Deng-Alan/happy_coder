import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Typography } from '@/constants/Typography';
import { formatSecretKeyForBackup } from '@/auth/secretKeyBackup';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { t } from '@/text';
import { layout } from '@/components/layout';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { useConnectAccount } from '@/hooks/useConnectAccount';
import { disconnectService, getConnectedServices } from '@/sync/apiServices';

type PersonalServiceKey = 'anthropic' | 'openai';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const PERSONAL_SERVICES: Array<{
    key: PersonalServiceKey;
    title: string;
    subtitle: string;
    command: string;
    icon: IoniconName;
    color: string;
}> = [
    {
        key: 'anthropic',
        title: 'Claude',
        subtitle: '用于 Claude 对话与继续会话',
        command: 'happy connect claude',
        icon: 'sparkles-outline',
        color: '#7C3AED',
    },
    {
        key: 'openai',
        title: 'Codex',
        subtitle: '用于 Codex 对话与继续会话',
        command: 'happy connect codex',
        icon: 'flash-outline',
        color: '#0EA5E9',
    },
];

export default React.memo(() => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const [showSecret, setShowSecret] = useState(false);
    const [copiedRecently, setCopiedRecently] = useState(false);
    const [connectedServices, setConnectedServices] = useState<string[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const { connectAccount, isLoading: isConnecting } = useConnectAccount();

    const currentSecret = auth.credentials?.secret || '';
    const formattedSecret = currentSecret ? formatSecretKeyForBackup(currentSecret) : '';

    const loadConnectedServices = async () => {
        if (!auth.credentials) {
            setConnectedServices([]);
            return;
        }

        try {
            setServicesLoading(true);
            const services = await getConnectedServices(auth.credentials);
            setConnectedServices(services);
        } catch (error) {
            setConnectedServices([]);
        } finally {
            setServicesLoading(false);
        }
    };

    useEffect(() => {
        loadConnectedServices();
    }, [auth.credentials?.token]);

    const handleCopySecret = async () => {
        try {
            await Clipboard.setStringAsync(formattedSecret);
            setCopiedRecently(true);
            setTimeout(() => setCopiedRecently(false), 2000);
            Modal.alert(t('common.success'), t('settingsAccount.secretKeyCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyCopyFailed'));
        }
    };

    const handleServicePress = async (serviceKey: PersonalServiceKey, title: string, command: string) => {
        const isConnected = connectedServices.includes(serviceKey);
        if (!auth.credentials) {
            return;
        }

        if (isConnected) {
            const confirmed = await Modal.confirm(
                `断开 ${title}`,
                `确认从你的个人服务器中移除 ${title} 凭据吗？`,
                { confirmText: '断开', destructive: true }
            );
            if (!confirmed) {
                return;
            }

            try {
                await disconnectService(auth.credentials, serviceKey);
                await loadConnectedServices();
                await sync.refreshProfile();
                Modal.alert('已断开', `${title} 凭据已从个人服务器移除。`);
            } catch (error) {
                Modal.alert('断开失败', error instanceof Error ? error.message : '请稍后重试');
            }
            return;
        }

        try {
            await Clipboard.setStringAsync(command);
            Modal.alert(
                `连接 ${title}`,
                `手机端暂时不直接走 OAuth。已帮你复制命令，请在电脑终端执行：\n\n${command}`
            );
        } catch (error) {
            Modal.alert(
                `连接 ${title}`,
                `请在电脑终端执行：\n\n${command}`
            );
        }
    };

    const handleResetIdentity = async () => {
        const confirmed = await Modal.confirm(
            '重置本机身份',
            '这会清除当前手机上的本地身份与缓存数据，随后自动生成一个新的个人身份。请先备份好当前密钥。',
            { confirmText: '立即重置', destructive: true }
        );
        if (confirmed) {
            auth.logout();
        }
    };

    return (
        <ItemList>
            <ItemGroup title="本机身份">
                <Item
                    title="状态"
                    detail={auth.isAuthenticated ? '已启用' : '初始化中'}
                    showChevron={false}
                />
                <Item
                    title="匿名标识"
                    detail={sync.anonID || '暂不可用'}
                    showChevron={false}
                    copy={!!sync.anonID}
                />
                <Item
                    title="服务器标识"
                    detail={sync.serverID || '暂不可用'}
                    showChevron={false}
                    copy={!!sync.serverID}
                />
                {Platform.OS !== 'web' && (
                    <Item
                        title="连接新设备"
                        subtitle={isConnecting ? '正在扫描…' : '扫描二维码，把这套个人身份同步到其他设备'}
                        icon={<Ionicons name="qr-code-outline" size={29} color="#007AFF" />}
                        onPress={connectAccount}
                        disabled={isConnecting}
                        showChevron={false}
                    />
                )}
            </ItemGroup>

            <ItemGroup
                title="模型服务"
                footer="个人版只保留 Claude 和 Codex。首次接入请在电脑终端运行对应命令，接入后手机端可直接复用。"
            >
                {PERSONAL_SERVICES.map((service) => {
                    const isConnected = connectedServices.includes(service.key);
                    return (
                        <Item
                            key={service.key}
                            title={service.title}
                            subtitle={isConnected ? `${service.subtitle} · 已连接` : `${service.subtitle} · 未连接（点击复制命令）`}
                            detail={servicesLoading ? '检查中' : (isConnected ? '已连接' : '未连接')}
                            icon={<Ionicons name={service.icon} size={29} color={service.color} />}
                            onPress={() => handleServicePress(service.key, service.title, service.command)}
                            showChevron={false}
                        />
                    );
                })}
            </ItemGroup>

            <ItemGroup
                title="密钥备份"
                footer="这串密钥是恢复当前个人身份的唯一凭证。请保存到密码管理器或其他安全位置。"
            >
                <Item
                    title="恢复密钥"
                    subtitle={showSecret ? '点击隐藏' : '点击显示'}
                    icon={<Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={29} color="#FF9500" />}
                    onPress={() => setShowSecret((prev) => !prev)}
                    showChevron={false}
                />
            </ItemGroup>

            {showSecret && (
                <ItemGroup>
                    <Pressable onPress={handleCopySecret}>
                        <View style={{
                            backgroundColor: theme.colors.surface,
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            width: '100%',
                            maxWidth: layout.maxWidth,
                            alignSelf: 'center'
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <Text style={{
                                    fontSize: 11,
                                    color: theme.colors.textSecondary,
                                    letterSpacing: 0.5,
                                    textTransform: 'uppercase',
                                    ...Typography.default('semiBold')
                                }}>
                                    {'恢复密钥（点击复制）'}
                                </Text>
                                <Ionicons
                                    name={copiedRecently ? 'checkmark-circle' : 'copy-outline'}
                                    size={18}
                                    color={copiedRecently ? '#34C759' : theme.colors.textSecondary}
                                />
                            </View>
                            <Text style={{
                                fontSize: 13,
                                letterSpacing: 0.5,
                                lineHeight: 20,
                                color: theme.colors.text,
                                ...Typography.mono()
                            }}>
                                {formattedSecret}
                            </Text>
                        </View>
                    </Pressable>
                </ItemGroup>
            )}

            <ItemGroup title="重置">
                <Item
                    title="重置本机身份"
                    subtitle="清除当前手机上的身份与缓存，并重新生成新的个人身份"
                    icon={<Ionicons name="log-out-outline" size={29} color="#FF3B30" />}
                    destructive
                    onPress={handleResetIdentity}
                />
            </ItemGroup>
        </ItemList>
    );
});
