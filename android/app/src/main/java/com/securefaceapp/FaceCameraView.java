package com.securefaceapp;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.Image;
import android.util.AttributeSet;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.LifecycleRegistry;
import android.view.View;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;

import org.tensorflow.lite.Interpreter;

import android.content.res.AssetFileDescriptor;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FaceCameraView extends FrameLayout implements LifecycleOwner {

    private PreviewView previewView;
    private FaceDetector detector;
    private Interpreter tfliteInterpreter;
    private ProcessCameraProvider cameraProvider;
    private LifecycleRegistry lifecycleRegistry;
    private ExecutorService analysisExecutor;

    private final List<String> activeChallenges = new ArrayList<>();
    private int currentChallengeIdx = 0;
    private boolean isBlinkStarted = false;
    private boolean isFinished = false;

    public FaceCameraView(@NonNull Context context) {
        super(context);
        init();
    }

    public FaceCameraView(@NonNull Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        previewView = new PreviewView(getContext());
        previewView.setLayoutParams(new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        addView(previewView);

        // Initialize ML Kit Face Detector
        FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .build();
        detector = FaceDetection.getClient(options);

        // Initialize TensorFlow Lite Interpreter
        try {
            tfliteInterpreter = new Interpreter(loadModelFile(getContext()));
        } catch (IOException e) {
            e.printStackTrace();
        }
        analysisExecutor = Executors.newSingleThreadExecutor();
    }

    @NonNull
    @Override
    public Lifecycle getLifecycle() {
        return lifecycleRegistry;
    }

    private MappedByteBuffer loadModelFile(Context context) throws IOException {
        AssetFileDescriptor fileDescriptor = context.getAssets().openFd("mobilefacenet.tflite");
        FileInputStream inputStream = new FileInputStream(fileDescriptor.getFileDescriptor());
        FileChannel fileChannel = inputStream.getChannel();
        long startOffset = fileDescriptor.getStartOffset();
        long declaredLength = fileDescriptor.getDeclaredLength();
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        // Transition manual lifecycle states to RESUMED to enable CameraX lifecycle binding
        lifecycleRegistry = new LifecycleRegistry(this);
        lifecycleRegistry.setCurrentState(Lifecycle.State.CREATED);
        lifecycleRegistry.setCurrentState(Lifecycle.State.STARTED);
        lifecycleRegistry.setCurrentState(Lifecycle.State.RESUMED);
        
        startCamera();
        postDelayed(this::initChallenges, 1000);
    }

    @Override
    protected void onDetachedFromWindow() {
        // Unbind and destroy CameraX states safely on unmount
        if (lifecycleRegistry != null) {
            lifecycleRegistry.setCurrentState(Lifecycle.State.DESTROYED);
        }
        super.onDetachedFromWindow();
        if (analysisExecutor != null) {
            analysisExecutor.shutdown();
        }
        if (cameraProvider != null) {
            cameraProvider.unbindAll();
        }
        if (detector != null) {
            detector.close();
        }
        if (tfliteInterpreter != null) {
            tfliteInterpreter.close();
        }
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        // React Native Layout Hack: Ensures layout boundaries are passed explicitly to the PreviewView
        previewView.layout(0, 0, right - left, bottom - top);
    }

    private final Runnable measureAndLayout = new Runnable() {
        @Override
        public void run() {
            measure(
                    View.MeasureSpec.makeMeasureSpec(getWidth(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(getHeight(), View.MeasureSpec.EXACTLY));
            layout(getLeft(), getTop(), getRight(), getBottom());
        }
    };

    @Override
    public void requestLayout() {
        super.requestLayout();
        post(measureAndLayout);
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = ProcessCameraProvider.getInstance(getContext());
        cameraProviderFuture.addListener(() -> {
            try {
                cameraProvider = cameraProviderFuture.get();
                bindCameraUseCases(cameraProvider);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private void bindCameraUseCases(@NonNull ProcessCameraProvider cameraProvider) {
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                .setTargetResolution(new Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();

        imageAnalysis.setAnalyzer(analysisExecutor, imageProxy -> {
            try {
                processFrame(imageProxy);
            } catch (Exception e) {
                e.printStackTrace();
                imageProxy.close();
            }
        });

        CameraSelector cameraSelector = new CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
                .build();

        try {
            cameraProvider.unbindAll();
            // Bind to 'this' which implements LifecycleOwner
            cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void initChallenges() {
        activeChallenges.clear();
        // Pick one challenge randomly for ultra-fast verification (<1s)
        if (Math.random() > 0.5) {
            activeChallenges.add("blink");
        } else {
            activeChallenges.add("smile");
        }
        currentChallengeIdx = 0;
        isBlinkStarted = false;
        isFinished = false;

        WritableMap event = Arguments.createMap();
        WritableArray chalArray = Arguments.createArray();
        for (String c : activeChallenges) {
            chalArray.pushString(c);
        }
        event.putArray("challenges", chalArray);
        emitEvent("onLivenessStarted", event);
    }

    private void processFrame(ImageProxy imageProxy) {
        @SuppressLint("UnsafeOptInUsageError")
        Image mediaImage = imageProxy.getImage();
        if (mediaImage == null) {
            imageProxy.close();
            return;
        }

        InputImage image = InputImage.fromMediaImage(mediaImage, imageProxy.getImageInfo().getRotationDegrees());
        detector.process(image)
                .addOnSuccessListener(analysisExecutor, faces -> {
                    if (faces.isEmpty()) {
                        imageProxy.close();
                        return;
                    }

                    Face face = faces.get(0);
                    for (Face f : faces) {
                        if (f.getBoundingBox().width() * f.getBoundingBox().height() >
                            face.getBoundingBox().width() * face.getBoundingBox().height()) {
                            face = f;
                        }
                    }

                    checkLivenessAndProcess(face, imageProxy);
                })
                .addOnFailureListener(analysisExecutor, e -> {
                    e.printStackTrace();
                    imageProxy.close();
                });
    }

    private void checkLivenessAndProcess(Face face, ImageProxy imageProxy) {
        if (isFinished) {
            imageProxy.close();
            return;
        }

        if (currentChallengeIdx < activeChallenges.size()) {
            String currentChallenge = activeChallenges.get(currentChallengeIdx);
            boolean passed = false;

            switch (currentChallenge) {
                case "blink":
                    Float leftEyeOpen = face.getLeftEyeOpenProbability();
                    Float rightEyeOpen = face.getRightEyeOpenProbability();
                    if (leftEyeOpen != null && rightEyeOpen != null) {
                        if (!isBlinkStarted && leftEyeOpen < 0.15f && rightEyeOpen < 0.15f) {
                            isBlinkStarted = true;
                        } else if (isBlinkStarted && leftEyeOpen > 0.65f && rightEyeOpen > 0.65f) {
                            passed = true;
                        }
                    }
                    break;
                case "smile":
                    Float smileProb = face.getSmilingProbability();
                    if (smileProb != null && smileProb > 0.75f) {
                        passed = true;
                    }
                    break;
                case "left":
                    float eulerY = face.getHeadEulerAngleY();
                    if (eulerY >= 18.0f) {
                        passed = true;
                    }
                    break;
                case "right":
                    float eulerYRight = face.getHeadEulerAngleY();
                    if (eulerYRight <= -18.0f) {
                        passed = true;
                    }
                    break;
            }

            if (passed) {
                WritableMap event = Arguments.createMap();
                event.putString("challenge", currentChallenge);
                event.putInt("index", currentChallengeIdx);
                emitEvent("onChallengeComplete", event);

                currentChallengeIdx++;
                isBlinkStarted = false;
            }

            imageProxy.close();
        } else {
            // Ensure user looks back straight at the camera before capturing embedding
            float eulerY = face.getHeadEulerAngleY();
            if (Math.abs(eulerY) > 8.0f) {
                // Face is still turned, skip this frame and wait for the user to look straight
                imageProxy.close();
                return;
            }

            isFinished = true;

            try {
                Bitmap bitmap = imageProxy.toBitmap();
                int rotationDegrees = imageProxy.getImageInfo().getRotationDegrees();
                if (rotationDegrees != 0) {
                    Matrix matrix = new Matrix();
                    matrix.postRotate(rotationDegrees);
                    bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
                }

                Rect bounds = face.getBoundingBox();
                int x = Math.max(0, bounds.left);
                int y = Math.max(0, bounds.top);
                int width = Math.min(bitmap.getWidth() - x, bounds.width());
                int height = Math.min(bitmap.getHeight() - y, bounds.height());

                if (width > 0 && height > 0) {
                    Bitmap croppedFace = Bitmap.createBitmap(bitmap, x, y, width, height);
                    Bitmap resizedFace = Bitmap.createScaledBitmap(croppedFace, 112, 112, true);
                    ByteBuffer inputBuffer = convertBitmapToByteBuffer(resizedFace);

                    if (tfliteInterpreter == null) {
                        isFinished = false;
                        WritableMap failEvent = Arguments.createMap();
                        failEvent.putString("error", "TFLite Interpreter is not initialized");
                        emitEvent("onLivenessFailed", failEvent);
                        return;
                    }

                    float[][] outputEmbeddings = new float[1][192];
                    tfliteInterpreter.run(inputBuffer, outputEmbeddings);

                    WritableMap event = Arguments.createMap();
                    WritableArray embArray = Arguments.createArray();
                    for (float val : outputEmbeddings[0]) {
                        embArray.pushDouble(val);
                    }
                    event.putArray("embedding", embArray);
                    emitEvent("onLivenessSuccess", event);
                } else {
                    isFinished = false;
                    WritableMap failEvent = Arguments.createMap();
                    failEvent.putString("error", "Invalid face crop boundaries");
                    emitEvent("onLivenessFailed", failEvent);
                }
            } catch (Exception e) {
                e.printStackTrace();
                isFinished = false;
                WritableMap failEvent = Arguments.createMap();
                failEvent.putString("error", e.getMessage());
                emitEvent("onLivenessFailed", failEvent);
            } finally {
                imageProxy.close();
            }
        }
    }

    private ByteBuffer convertBitmapToByteBuffer(Bitmap bitmap) {
        ByteBuffer byteBuffer = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4);
        byteBuffer.order(ByteOrder.nativeOrder());
        int[] intValues = new int[112 * 112];
        bitmap.getPixels(intValues, 0, bitmap.getWidth(), 0, 0, bitmap.getWidth(), bitmap.getHeight());
        byteBuffer.rewind();
        for (int i = 0; i < 112 * 112; ++i) {
            final int val = intValues[i];
            byteBuffer.putFloat((((val >> 16) & 0xFF) - 127.5f) / 128.0f);
            byteBuffer.putFloat((((val >> 8) & 0xFF) - 127.5f) / 128.0f);
            byteBuffer.putFloat(((val & 0xFF) - 127.5f) / 128.0f);
        }
        return byteBuffer;
    }

    private void emitEvent(String eventName, WritableMap eventData) {
        ReactContext reactContext = (ReactContext) getContext();
        reactContext.getJSModule(RCTEventEmitter.class)
                .receiveEvent(getId(), eventName, eventData);
    }

    public void resetLiveness() {
        post(this::initChallenges);
    }
}
