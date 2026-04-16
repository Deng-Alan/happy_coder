import { RoundButton } from '@/components/RoundButton';
import { useAuth } from '@/auth/AuthContext';
import { Text, View, Image } from 'react-native';
import * as React from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { HomeHeaderNotAuth } from '@/components/HomeHeader';
import { MainView } from '@/components/MainView';
import { t } from '@/text';
import { createPersonalCredentials } from '@/auth/createPersonalCredentials';

export default function Home() {
    const auth = useAuth();

    if (!auth.isAuthenticated) {
        return <ProvisioningScreen />;
    }

    return <MainView variant="phone" />;
}

function ProvisioningScreen() {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const router = useRouter();
    const [isProvisioning, setIsProvisioning] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const provision = React.useCallback(async () => {
        setIsProvisioning(true);
        setError(null);

        try {
            const credentials = await createPersonalCredentials();
            await auth.login(credentials.token, credentials.secret);
        } catch (nextError) {
            console.error('Failed to provision personal account:', nextError);
            setError(nextError instanceof Error ? nextError.message : t('server.failedToConnectToServer'));
        } finally {
            setIsProvisioning(false);
        }
    }, [auth]);

    React.useEffect(() => {
        void provision();
    }, [provision]);

    return (
        <>
            <HomeHeaderNotAuth />
            <View style={styles.container}>
                <Image
                    source={theme.dark ? require('@/assets/images/logotype-light.png') : require('@/assets/images/logotype-dark.png')}
                    resizeMode="contain"
                    style={styles.logo}
                />
                <Text style={styles.title}>
                    {isProvisioning ? t('common.loading') : t('server.failedToConnectToServer')}
                </Text>
                <Text style={styles.subtitle}>
                    {isProvisioning
                        ? t('welcome.subtitle')
                        : error || t('server.serverReturnedError')}
                </Text>

                {!isProvisioning && (
                    <>
                        <View style={styles.buttonContainer}>
                            <RoundButton
                                title={t('common.retry')}
                                action={provision}
                            />
                        </View>
                        <View style={styles.buttonContainerSecondary}>
                            <RoundButton
                                size="normal"
                                title={t('server.serverConfiguration')}
                                onPress={() => router.push('/server')}
                                display="inverted"
                            />
                        </View>
                    </>
                )}
            </View>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    logo: {
        width: 300,
        height: 90,
    },
    title: {
        marginTop: 16,
        textAlign: 'center',
        fontSize: 24,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    subtitle: {
        ...Typography.default(),
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginTop: 16,
        textAlign: 'center',
        marginBottom: 40,
        maxWidth: 340,
    },
    buttonContainer: {
        maxWidth: 280,
        width: '100%',
        marginBottom: 16,
    },
    buttonContainerSecondary: {
        maxWidth: 280,
        width: '100%',
    },
}));
