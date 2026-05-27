/**
 * FaceCamera - React Native bridge to native FaceCameraView.
 * 
 * Communicates with native Android (CameraX + ML Kit + TFLite) and
 * iOS (AVFoundation + Vision) modules via the React Native bridge.
 * 
 * Events:
 * - onLivenessStarted: Camera ready, challenges assigned
 * - onChallengeComplete: Individual challenge passed
 * - onLivenessSuccess: All challenges passed + embedding extracted
 * - onLivenessFailed: Error or timeout during liveness
 * 
 * Commands:
 * - reset(): Restart the liveness challenge sequence
 */
import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import {
  requireNativeComponent,
  UIManager,
  findNodeHandle,
  StyleSheet,
  View,
  Platform,
  StyleProp,
  ViewStyle,
  NativeSyntheticEvent,
} from 'react-native';
import {
  LivenessStartedEvent,
  ChallengeCompleteEvent,
  LivenessSuccessEvent,
  LivenessFailedEvent,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────

interface FaceCameraProps {
  style?: StyleProp<ViewStyle>;
  onLivenessStarted?: (data: LivenessStartedEvent) => void;
  onChallengeComplete?: (data: ChallengeCompleteEvent) => void;
  onLivenessSuccess?: (data: LivenessSuccessEvent) => void;
  onLivenessFailed?: (data: LivenessFailedEvent) => void;
}

export interface FaceCameraHandle {
  reset: () => void;
}

// ─── Native Component ─────────────────────────────────────────────

const NativeFaceCameraView = requireNativeComponent<any>('FaceCameraView');

// ─── Component ────────────────────────────────────────────────────

const FaceCamera = forwardRef<FaceCameraHandle, FaceCameraProps>(
  ({ onLivenessStarted, onChallengeComplete, onLivenessSuccess, onLivenessFailed, style }, ref) => {
    const cameraRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (!cameraRef.current) return;

        const handle = findNodeHandle(cameraRef.current);
        if (!handle) return;

        try {
          if (Platform.OS === 'android') {
            const commands = UIManager.getViewManagerConfig?.('FaceCameraView')?.Commands;
            if (commands?.reset !== undefined) {
              UIManager.dispatchViewManagerCommand(handle, commands.reset, []);
            }
          } else {
            // iOS uses method-based commands via the manager
            UIManager.dispatchViewManagerCommand(handle, 'reset', []);
          }
        } catch (error) {
          console.warn('[FaceCamera] Failed to dispatch reset command:', error);
        }
      },
    }));

    const handleLivenessStarted = (event: NativeSyntheticEvent<LivenessStartedEvent>) => {
      onLivenessStarted?.(event.nativeEvent);
    };

    const handleChallengeComplete = (event: NativeSyntheticEvent<ChallengeCompleteEvent>) => {
      onChallengeComplete?.(event.nativeEvent);
    };

    const handleLivenessSuccess = (event: NativeSyntheticEvent<LivenessSuccessEvent>) => {
      onLivenessSuccess?.(event.nativeEvent);
    };

    const handleLivenessFailed = (event: NativeSyntheticEvent<LivenessFailedEvent>) => {
      onLivenessFailed?.(event.nativeEvent);
    };

    return (
      <View style={[styles.container, style]}>
        <NativeFaceCameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          onLivenessStarted={handleLivenessStarted}
          onChallengeComplete={handleChallengeComplete}
          onLivenessSuccess={handleLivenessSuccess}
          onLivenessFailed={handleLivenessFailed}
        />
      </View>
    );
  },
);

FaceCamera.displayName = 'FaceCamera';

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});

export default FaceCamera;
