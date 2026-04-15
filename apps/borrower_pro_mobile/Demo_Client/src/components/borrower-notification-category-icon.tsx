import type { BorrowerNotificationCategoryKind } from '@kredit/borrower';
import {
  borrowerNotificationCategoryLabel,
  resolveBorrowerNotificationCategoryKind,
} from '@kredit/borrower';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const GLYPHS: Record<BorrowerNotificationCategoryKind, ComponentProps<typeof MaterialIcons>['name']> = {
  payments: 'payments',
  collections: 'warning',
  loan_lifecycle: 'account-balance',
  applications: 'assignment',
  announcements: 'campaign',
  other: 'notifications',
};

export interface BorrowerNotificationCategoryIconProps {
  category: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<TextStyle>;
}

export function BorrowerNotificationCategoryIcon({
  category,
  size = 22,
  color,
  style,
  iconStyle,
}: BorrowerNotificationCategoryIconProps) {
  const theme = useTheme();
  const kind = resolveBorrowerNotificationCategoryKind(category);
  const name = GLYPHS[kind];
  const tint = color ?? theme.textSecondary;

  return (
    <View
      accessibilityLabel={borrowerNotificationCategoryLabel(category)}
      style={style}>
      <MaterialIcons name={name} size={size} color={tint} style={iconStyle} />
    </View>
  );
}
