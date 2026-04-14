import type { BorrowerDocument } from '@kredit/borrower';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth/auth-client';
import { getEnv } from '@/lib/config/env';
import { humanizeToken, normalizeDisplayValue } from '@/lib/format/borrower';
import { formatDateTime } from '@/lib/format/date';

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

const authClientWithCookie = authClient as typeof authClient & {
  getCookie: () => string | null | undefined;
};

export function BorrowerDocumentCard({ document: doc }: { document: BorrowerDocument }) {
  const theme = useTheme();
  const uri = `${getEnv().backendUrl}/api/borrower-auth/borrower/documents/${doc.id}/file`;
  const cookie = authClientWithCookie.getCookie?.();

  const imageSource = useMemo(() => {
    if (!isImageMime(doc.mimeType)) {
      return null;
    }
    return {
      uri,
      headers: cookie ? { Cookie: cookie } : undefined,
    };
  }, [uri, doc.mimeType, cookie]);

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
      ]}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={styles.preview}
          contentFit="contain"
          transition={200}
          accessibilityLabel={normalizeDisplayValue(doc.originalName)}
        />
      ) : (
        <View
          style={[
            styles.previewPlaceholder,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <MaterialIcons name="picture-as-pdf" size={40} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.pdfHint}>
            PDF preview is not shown in the app
          </ThemedText>
        </View>
      )}
      <View style={styles.stackTight}>
        <ThemedText type="smallBold">{normalizeDisplayValue(doc.originalName)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {humanizeToken(doc.category)}
        </ThemedText>
      </View>
      <View style={styles.infoGrid}>
        <View style={styles.infoField}>
          <ThemedText type="small" themeColor="textSecondary">
            Filename
          </ThemedText>
          <ThemedText type="default">{normalizeDisplayValue(doc.filename)}</ThemedText>
        </View>
        <View style={styles.infoField}>
          <ThemedText type="small" themeColor="textSecondary">
            Uploaded
          </ThemedText>
          <ThemedText type="default">{formatDateTime(doc.uploadedAt)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  previewPlaceholder: {
    width: '100%',
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  pdfHint: {
    textAlign: 'center',
  },
  stackTight: {
    gap: Spacing.one,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  infoField: {
    flexBasis: 160,
    flexGrow: 1,
    gap: Spacing.one,
  },
});
