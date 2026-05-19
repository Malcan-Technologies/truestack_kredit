import type { ConfigContext, ExpoConfig } from 'expo/config';

// Shared mobile code (Expo Router routes, components, lib, brand, assets) lives one level up at
// `apps/borrower_pro_mobile/`. This per-client app only carries identity + native config; keep the
// shared bits (router `root`, `../assets/*` paths, plugins, experiments) in sync with sibling clients.

/** Hostname only (no scheme), same as the deployed borrower web app — enables Universal / App Links when set. */
function universalLinkHost(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST?.trim();
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export default function appConfig(_context: ConfigContext): ExpoConfig {
  const linkHost = universalLinkHost();

  return {
    name: 'Demo_Client',
    slug: 'Demo_Client',
    version: '1.0.0',
    orientation: 'portrait',
    updates: {
      url: 'https://u.expo.dev/64ab2eca-cfdb-4cc4-b973-35eb682e37db',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    icon: '../assets/images/icon.png',
    scheme: 'democlient',
    userInterfaceStyle: 'automatic',
    ios: {
      /** Required for `expo prebuild` / `expo run:ios` — cannot be inferred when using dynamic `app.config.ts`. */
      bundleIdentifier: 'com.truestack.democlient',
      icon: '../assets/expo.icon',
      ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
    },
    android: {
      package: 'com.truestack.democlient',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: '../assets/images/android-icon-foreground.png',
        backgroundImage: '../assets/images/android-icon-background.png',
        monochromeImage: '../assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      ...(linkHost
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [
                  { scheme: 'https', host: linkHost, pathPrefix: '/reset-password' },
                  { scheme: 'https', host: linkHost, pathPrefix: '/verify-email' },
                ],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    web: {
      output: 'static',
      favicon: '../assets/images/favicon.png',
    },
    plugins: [
      // Routes live in the shared `apps/borrower_pro_mobile/app` directory (one level up).
      ['expo-router', { root: '../app' }],
      'expo-font',
      'expo-image',
      'expo-secure-store',
      'expo-sharing',
      'expo-video',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: '../assets/images/android-icon-monochrome.png',
          color: '#208AEF',
          sounds: [],
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          android: {
            image: '../assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: '64ab2eca-cfdb-4cc4-b973-35eb682e37db',
      },
    },
  };
}
