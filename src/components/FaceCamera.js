import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { requireNativeComponent, UIManager, findNodeHandle, StyleSheet, View } from 'react-native';

const NativeFaceCameraView = requireNativeComponent('FaceCameraView');

const FaceCamera = forwardRef(({
  onLivenessStarted,
  onChallengeComplete,
  onLivenessSuccess,
  onLivenessFailed,
  style
}, ref) => {
  const cameraRef = useRef(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (cameraRef.current) {
        const handle = findNodeHandle(cameraRef.current);
        if (handle) {
          UIManager.dispatchViewManagerCommand(
            handle,
            UIManager.getViewManagerConfig('FaceCameraView').Commands.reset,
            []
          );
        }
      }
    }
  }));

  const handleLivenessStarted = (event) => {
    if (onLivenessStarted) {
      onLivenessStarted(event.nativeEvent);
    }
  };

  const handleChallengeComplete = (event) => {
    if (onChallengeComplete) {
      onChallengeComplete(event.nativeEvent);
    }
  };

  const handleLivenessSuccess = (event) => {
    if (onLivenessSuccess) {
      onLivenessSuccess(event.nativeEvent);
    }
  };

  const handleLivenessFailed = (event) => {
    if (onLivenessFailed) {
      onLivenessFailed(event.nativeEvent);
    }
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
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});

export default FaceCamera;
