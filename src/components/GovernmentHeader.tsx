import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';

const GovernmentHeader: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <View style={styles.emblemContainer}>
          <View style={styles.emblemSaffron} />
          <View style={styles.emblemWhite}>
            <View style={styles.emblemChakra} />
          </View>
          <View style={styles.emblemGreen} />
        </View>
        <View style={styles.textColumn}>
          <Text style={styles.title}>NHAI</Text>
          <Text style={styles.subtitle}>Government of India</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emblemContainer: {
    width: 24,
    height: 24,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  emblemSaffron: {
    flex: 1,
    backgroundColor: '#FF9933',
  },
  emblemWhite: {
    flex: 1,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emblemChakra: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#000080',
  },
  emblemGreen: {
    flex: 1,
    backgroundColor: '#138808',
  },
  textColumn: {
    marginLeft: 10,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textSub,
  },
});

export default GovernmentHeader;
