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
import { formatDate } from '@/lib/format/date';

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

const THUMB_SIZE = 44;

const authClientWithCookie = authClient as typeof authClient & {
  getCookie: () => string | null | undefined;
};

/** Compact list row: small thumb, filename + category · date. */
export function BorrowerDocumentListItem({
  document: doc,
  isLast,
}: {
  document: BorrowerDocument;
  /** Omit bottom divider (last row in a group). */
  isLast?: boolean;
}) {
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

  const meta = `${humanizeToken(doc.category)} · ${formatDate(doc.uploadedAt)}`;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${normalizeDisplayValue(doc.originalName)}, ${meta}`}
      style={[
        styles.listRow,
        {
          borderBottomColor: theme.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}>
      {imageSource ? (
        <Image
          source={imageSource}
          style={[styles.thumbImage, { backgroundColor: theme.backgroundElement }]}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            styles.thumbPlaceholder,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <MaterialIcons name="insert-drive-file" size={22} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.listCopy}>
        <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="middle">
          {normalizeDisplayValue(doc.originalName)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {meta}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    minHeight: 56,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
});
