# iOS TFLite Model Setup — One-Time Manual Step

The iOS `FaceCameraView.swift` loads `mobilefacenet_tuned.tflite` from the app bundle.
Because iOS resources must be explicitly added to the Xcode target, follow these steps:

## Step 1: Copy the Model File

The model is already in Android assets. Copy it for iOS:

```powershell
# From project root
Copy-Item "android\app\src\main\assets\mobilefacenet_tuned.tflite" `
          "ios\SecureFaceApp\mobilefacenet_tuned.tflite"
```

## Step 2: Add to Xcode Project

1. Open `ios/SecureFaceApp.xcworkspace` in Xcode (after `pod install`)
2. In the Project Navigator, right-click **SecureFaceApp** folder → **Add Files to "SecureFaceApp"**
3. Select `mobilefacenet_tuned.tflite`
4. ✅ Check **"Copy items if needed"**
5. ✅ Check **"Add to target: SecureFaceApp"**
6. Click **Add**

## Step 3: Install Pods

```bash
cd ios
pod install
cd ..
```

## Step 4: Verify in Build Phases

In Xcode → Target → **Build Phases** → **Copy Bundle Resources**, confirm
`mobilefacenet_tuned.tflite` appears in the list.

## Notes

- The model is the same `mobilefacenet_tuned.tflite` fine-tuned on 200+ Indian face images
- Input: 112×112×3 float32, normalized (pixel - 127.5) / 128.0
- Output: 192D float32 embedding vector (identical to Android pipeline)
- TFLite iOS pod (`TensorFlowLiteSwift ~> 2.14.0`) added to Podfile automatically
