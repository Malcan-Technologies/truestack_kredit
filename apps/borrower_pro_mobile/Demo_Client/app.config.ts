import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig(_context: ConfigContext): ExpoConfig {
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
      ['expo-video'],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
}
