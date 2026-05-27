/**
 * PinModal - Reusable PIN entry modal for admin authentication.
 *
 * Modes:
 * - 'verify': Enter existing PIN to unlock protected action
 * - 'setup': Create a new 4-digit PIN (first-time or change)
 * - 'change': Enter old PIN then new PIN
 *
 * Features:
 * - 4-digit numeric keypad
 * - Dot indicators showing entered digits
 * - Error message display with remaining attempts
 * - Lockout countdown timer
 * - Cancel button to dismiss
 */
import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PinModalProps {
  visible: boolean;
  mode: 'verify' | 'setup' | 'change';
  title?: string;
  onSuccess: (pin: string) => void;
  onCancel: () => void;
  error?: string;
}

const PinModal: React.FC<PinModalProps> = ({
  visible,
  mode,
  title,
  onSuccess,
  onCancel,
  error,
}) => {
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState('');

  const displayTitle = title || (
    mode === 'setup' ? 'Create Admin PIN' :
    mode === 'change' ? 'Enter Current PIN' :
    'Enter Admin PIN'
  );

  const handleDigitPress = useCallback((digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setLocalError('');

    if (newPin.length === 4) {
      // Auto-submit when 4 digits entered
      setTimeout(() => {
        onSuccess(newPin);
        setPin('');
      }, 200);
    }
  }, [pin, onSuccess]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setLocalError('');
  }, []);

  const handleCancel = useCallback(() => {
    setPin('');
    setLocalError('');
    onCancel();
  }, [onCancel]);

  const displayError = error || localError;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.subtitle}>
            {mode === 'setup'
              ? 'Choose a 4-digit PIN to protect admin functions'
              : 'Enter your 4-digit admin PIN'}
          </Text>

          {/* PIN Dots */}
          <View style={styles.dotsRow}>
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < pin.length && styles.dotFilled,
                ]}
              />
            ))}
          </View>

          {/* Error */}
          {displayError ? (
            <Text style={styles.errorText}>{displayError}</Text>
          ) : null}

          {/* Keypad */}
          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'].map(
              (key, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.key,
                    key === '' && styles.keyEmpty,
                  ]}
                  onPress={() => {
                    if (key === 'DEL') handleBackspace();
                    else if (key !== '') handleDigitPress(key);
                  }}
                  disabled={key === ''}
                >
                  <Text style={[styles.keyText, key === 'DEL' && styles.keyTextSmall]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_WIDTH - 60,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSub,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginHorizontal: 8,
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 240,
    marginBottom: SPACING.lg,
  },
  key: {
    width: 64,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#F3F4F6',
  },
  keyEmpty: {
    backgroundColor: 'transparent',
  },
  keyText: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  keyTextSmall: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textSub,
  },
  cancelBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  cancelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.danger,
  },
});

export default PinModal;
