package com.securefaceapp;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

import java.util.HashMap;
import java.util.Map;

public class FaceCameraViewManager extends SimpleViewManager<FaceCameraView> {
    public static final String REACT_CLASS = "FaceCameraView";
    public static final int COMMAND_RESET = 1;

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected FaceCameraView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new FaceCameraView(reactContext);
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        Map<String, Object> map = new HashMap<>();
        map.put("onLivenessStarted", MapBuilder.of("registrationName", "onLivenessStarted"));
        map.put("onChallengeComplete", MapBuilder.of("registrationName", "onChallengeComplete"));
        map.put("onLivenessSuccess", MapBuilder.of("registrationName", "onLivenessSuccess"));
        map.put("onLivenessFailed", MapBuilder.of("registrationName", "onLivenessFailed"));
        return map;
    }

    @Nullable
    @Override
    public Map<String, Integer> getCommandsMap() {
        return MapBuilder.of("reset", COMMAND_RESET);
    }

    @Override
    public void receiveCommand(@NonNull FaceCameraView root, int commandId, @Nullable ReadableArray args) {
        if (commandId == COMMAND_RESET) {
            root.resetLiveness();
        } else {
            super.receiveCommand(root, commandId, args);
        }
    }
}
