import type { ConfigContext, ExpoConfig } from 'expo/config';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function parseHostname(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function resolvePasskeyRpId() {
  const configuredRpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID?.trim();
  if (configuredRpId) {
    return configuredRpId;
  }

  return parseHostname(process.env.EXPO_PUBLIC_AUTH_BASE_URL?.trim());
}

export default function appConfig(_context: ConfigContext): ExpoConfig {
  const passkeyRpId = resolvePasskeyRpId();
  const includeAssociatedDomain =
    Boolean(passkeyRpId) && !LOOPBACK_HOSTS.has((passkeyRpId ?? '').toLowerCase());

  return {
    name: 'Demo_Client',
    slug: 'Demo_Client',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'democlient',
    userInterfaceStyle: 'automatic',
    ios: {
      /** Required for `expo prebuild` / `expo run:ios` — cannot be inferred when using dynamic `app.config.ts`. */
      bundleIdentifier: 'com.anonymous.Demo-Client',
      icon: './assets/expo.icon',
      ...(includeAssociatedDomain
        ? {
            associatedDomains: [`webcredentials:${passkeyRpId}`],
          }
        : {}),
    },
    android: {
      package: 'com.anonymous.democlient',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-video',
      [
        'expo-notifications',
        {
          icon: './assets/images/android-icon-monochrome.png',
          color: '#208AEF',
          sounds: [],
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
      [
        'expo-video'
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
}
