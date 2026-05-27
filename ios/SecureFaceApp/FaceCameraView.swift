import Foundation
import UIKit
import AVFoundation
import Vision
import React
import TensorFlowLite

/**
 * FaceCameraView - iOS native camera view for facial recognition & liveness detection.
 *
 * Matches Android FaceCameraView.java behavior:
 * - AVFoundation for camera capture (front camera)
 * - Vision framework (VNDetectFaceLandmarksRequest) for face detection & landmark extraction
 * - TensorFlow Lite (TFLite) with mobilefacenet_tuned.tflite for 192D embedding extraction
 * - Randomized 2-3 challenge liveness (blink, smile, left, right)
 * - 30-second timeout auto-fail
 * - Thread-safe state management
 *
 * Liveness thresholds (matching Android & LIVENESS_CONFIG in theme.ts):
 *   Blink:  eyeOpenProbability < 0.15  →  > 0.65
 *   Smile:  smilingProbability > 0.75
 *   Left:   yaw >= 18.0°
 *   Right:  yaw <= -18.0°
 */
class FaceCameraView: UIView {

    // MARK: - RN Event Callbacks
    @objc var onLivenessStarted: RCTDirectEventBlock?
    @objc var onChallengeComplete: RCTDirectEventBlock?
    @objc var onLivenessSuccess: RCTDirectEventBlock?
    @objc var onLivenessFailed: RCTDirectEventBlock?

    // MARK: - Camera
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let frameQueue = DispatchQueue(label: "com.securefaceapp.camera.frames", qos: .userInitiated)

    // MARK: - TFLite
    private var interpreter: Interpreter?

    // MARK: - Liveness State
    private var activeChallenges: [String] = []
    private var currentChallengeIdx: Int = 0
    private var isBlinkStarted: Bool = false
    private var isFinished: Bool = false
    private var isDestroyed: Bool = false
    private var livenessTimer: Timer?
    private let stateLock = NSLock()

    private static let livenessTimeoutSeconds: TimeInterval = 30.0
    private static let modelFileName = "mobilefacenet_tuned"
    private static let modelFileExtension = "tflite"
    private static let inputSize: Int = 112
    private static let embeddingSize: Int = 192

    // MARK: - Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        backgroundColor = .black
        loadTFLiteModel()
        setupCamera()
    }

    // MARK: - TFLite Model Loading

    private func loadTFLiteModel() {
        guard let modelPath = Bundle.main.path(
            forResource: FaceCameraView.modelFileName,
            ofType: FaceCameraView.modelFileExtension
        ) else {
            NSLog("[FaceCameraView] ERROR: \(FaceCameraView.modelFileName).tflite not found in bundle. Add it to iOS target resources.")
            return
        }

        do {
            var options = Interpreter.Options()
            options.threadCount = 2
            interpreter = try Interpreter(modelPath: modelPath, options: options)
            try interpreter?.allocateTensors()
            NSLog("[FaceCameraView] TFLite model loaded successfully")
        } catch {
            NSLog("[FaceCameraView] ERROR loading TFLite model: \(error)")
            interpreter = nil
        }
    }

    // MARK: - Camera Setup

    private func setupCamera() {
        let session = AVCaptureSession()
        session.sessionPreset = .high

        guard let frontCamera = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .front
        ) else {
            showError("No front camera available on this device")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: frontCamera)
            guard session.canAddInput(input) else {
                showError("Cannot add camera input")
                return
            }
            session.addInput(input)

            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            output.setSampleBufferDelegate(self, queue: frameQueue)
            guard session.canAddOutput(output) else {
                showError("Cannot add video output")
                return
            }
            session.addOutput(output)

            // Mirror front camera preview
            if let connection = output.connection(with: .video) {
                connection.isVideoMirrored = true
            }

            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = bounds
            layer.addSublayer(preview)
            previewLayer = preview
            captureSession = session

            DispatchQueue.global(qos: .userInitiated).async {
                session.startRunning()
            }
        } catch {
            showError("Camera initialization failed: \(error.localizedDescription)")
        }
    }

    private func showError(_ text: String) {
        DispatchQueue.main.async {
            let label = UILabel()
            label.text = text
            label.textColor = .white
            label.textAlignment = .center
            label.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
            label.numberOfLines = 0
            label.frame = self.bounds
            label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            self.addSubview(label)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    // MARK: - Lifecycle cleanup
    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil {
            // View is being removed — stop camera to prevent battery drain & crashes
            isDestroyed = true
            stateLock.lock()
            cancelTimeoutLocked()
            stateLock.unlock()
            captureSession?.stopRunning()
            previewLayer?.removeFromSuperlayer()
            NSLog("[FaceCameraView] Camera session stopped on unmount")
        }
    }

    // MARK: - Liveness Challenge Logic

    func resetLiveness() {
        stateLock.lock()
        cancelTimeoutLocked()
        let pool = ["blink", "smile", "left", "right"].shuffled()
        let numChallenges = Int.random(in: 2...3)
        activeChallenges = Array(pool.prefix(numChallenges))
        currentChallengeIdx = 0
        isBlinkStarted = false
        isFinished = false
        stateLock.unlock()

        startTimeout()
        onLivenessStarted?(["challenges": activeChallenges])
    }

    // MARK: - Timeout

    private func startTimeout() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            self.cancelTimeoutLocked()
            self.livenessTimer = Timer.scheduledTimer(
                withTimeInterval: FaceCameraView.livenessTimeoutSeconds,
                repeats: false
            ) { [weak self] _ in
                guard let self = self else { return }
                self.stateLock.lock()
                let alreadyDone = self.isFinished || self.isDestroyed
                if !alreadyDone { self.isFinished = true }
                self.stateLock.unlock()
                if !alreadyDone {
                    self.onLivenessFailed?([
                        "error": "Liveness timeout: challenges not completed within 30 seconds"
                    ])
                }
            }
            self.stateLock.unlock()
        }
    }

    private func cancelTimeoutLocked() {
        livenessTimer?.invalidate()
        livenessTimer = nil
    }

    // MARK: - Lifecycle

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            stateLock.lock()
            isDestroyed = false
            stateLock.unlock()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.resetLiveness()
            }
        } else {
            stateLock.lock()
            isDestroyed = true
            cancelTimeoutLocked()
            stateLock.unlock()
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.captureSession?.stopRunning()
            }
        }
    }

    deinit {
        stateLock.lock()
        isDestroyed = true
        cancelTimeoutLocked()
        stateLock.unlock()
        captureSession?.stopRunning()
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension FaceCameraView: AVCaptureVideoDataOutputSampleBufferDelegate {

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        stateLock.lock()
        let destroyed = isDestroyed
        stateLock.unlock()
        guard !destroyed else { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        // Run Vision face detection on this frame
        let request = VNDetectFaceLandmarksRequest { [weak self] request, error in
            guard let self = self,
                  let results = request.results as? [VNFaceObservation],
                  !results.isEmpty else { return }

            // Select largest face
            let largestFace = results.max(by: {
                ($0.boundingBox.width * $0.boundingBox.height) <
                ($1.boundingBox.width * $1.boundingBox.height)
            })!

            self.processFaceObservation(largestFace, pixelBuffer: pixelBuffer)
        }

        // Mirror the image for front camera (Vision expects unmirrored)
        let handler = VNImageRequestHandler(
            cvPixelBuffer: pixelBuffer,
            orientation: .leftMirrored,
            options: [:]
        )
        try? handler.perform([request])
    }

    private func processFaceObservation(_ face: VNFaceObservation, pixelBuffer: CVPixelBuffer) {
        stateLock.lock()
        let finished = isFinished
        let destroyed = isDestroyed
        var challengeIdx = currentChallengeIdx
        let challenges = activeChallenges
        stateLock.unlock()

        guard !finished && !destroyed else { return }
        guard let landmarks = face.landmarks else { return }

        if challengeIdx < challenges.count {
            let challenge = challenges[challengeIdx]
            var passed = false

            switch challenge {
            case "blink":
                // Estimate eye openness from landmark positions
                let leftEyeOpen = estimateEyeOpenness(landmarks.leftEye)
                let rightEyeOpen = estimateEyeOpenness(landmarks.rightEye)
                stateLock.lock()
                if !isBlinkStarted && leftEyeOpen < 0.15 && rightEyeOpen < 0.15 {
                    isBlinkStarted = true
                } else if isBlinkStarted && leftEyeOpen > 0.65 && rightEyeOpen > 0.65 {
                    passed = true
                }
                stateLock.unlock()

            case "smile":
                if let smileProb = face.landmarks?.outerLips {
                    let smileScore = estimateSmile(smileProb)
                    passed = smileScore > 0.75
                }

            case "left":
                // yaw > 18° = looking right in camera = head turned left
                if let yaw = face.yaw?.floatValue {
                    passed = yaw >= 18.0
                }

            case "right":
                if let yaw = face.yaw?.floatValue {
                    passed = yaw <= -18.0
                }

            default:
                break
            }

            if passed {
                stateLock.lock()
                currentChallengeIdx += 1
                challengeIdx = currentChallengeIdx
                isBlinkStarted = false
                stateLock.unlock()

                onChallengeComplete?([
                    "challenge": challenge,
                    "index": challengeIdx - 1
                ])
            }
        } else {
            // All challenges passed — check face is roughly frontal before capture
            guard let yaw = face.yaw?.floatValue, abs(yaw) < 8.0 else { return }

            // Atomic set: only capture once
            stateLock.lock()
            let alreadyDone = isFinished
            if !alreadyDone { isFinished = true }
            stateLock.unlock()
            guard !alreadyDone else { return }

            stateLock.lock()
            cancelTimeoutLocked()
            stateLock.unlock()

            extractEmbeddingAndEmit(pixelBuffer: pixelBuffer, faceBounds: face.boundingBox)
        }
    }

    // MARK: - TFLite Embedding Extraction

    private func extractEmbeddingAndEmit(pixelBuffer: CVPixelBuffer, faceBounds: CGRect) {
        guard let interpreter = interpreter else {
            onLivenessFailed?(["error": "TFLite interpreter not initialized"])
            stateLock.lock(); isFinished = false; stateLock.unlock()
            return
        }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        // Convert normalized VN bounding box (bottom-left origin) to pixel coords (top-left origin)
        let x = Int(faceBounds.minX * CGFloat(width))
        let y = Int((1.0 - faceBounds.maxY) * CGFloat(height))
        let w = Int(faceBounds.width * CGFloat(width))
        let h = Int(faceBounds.height * CGFloat(height))

        guard w > 0 && h > 0 else {
            onLivenessFailed?(["error": "Invalid face crop boundaries"])
            stateLock.lock(); isFinished = false; stateLock.unlock()
            return
        }

        // Crop face region from pixel buffer → CGImage → resize to 112x112 → BGRA Data
        guard let croppedCGImage = cropPixelBuffer(pixelBuffer, x: x, y: y, width: w, height: h),
              let resizedBGRA = resizeImage(croppedCGImage, to: CGSize(
                width: FaceCameraView.inputSize,
                height: FaceCameraView.inputSize
              )) else {
            onLivenessFailed?(["error": "Failed to crop/resize face"])
            stateLock.lock(); isFinished = false; stateLock.unlock()
            return
        }

        // Build float32 input tensor: normalize (pixel - 127.5) / 128.0 per channel
        // Input BGRA layout: [B, G, R, A] per pixel → output RGB float32 layout: [R, G, B]
        let pixelCount = FaceCameraView.inputSize * FaceCameraView.inputSize
        var inputData = Data(count: pixelCount * 3 * MemoryLayout<Float32>.size)
        inputData.withUnsafeMutableBytes { rawBuffer in
            guard let floatPtr = rawBuffer.bindMemory(to: Float32.self).baseAddress else { return }
            var pixelIdx = 0
            resizedBGRA.withUnsafeBytes { bytes in
                let ptr = bytes.bindMemory(to: UInt8.self)
                var i = 0
                while i < pixelCount * 4 {
                    // BGRA byte order from CGContext with byteOrder32Little
                    let b = Float32(ptr[i])
                    let g = Float32(ptr[i + 1])
                    let r = Float32(ptr[i + 2])
                    // ptr[i + 3] = alpha — skip
                    // Output: RGB normalized to [-1.0, 1.0]
                    floatPtr[pixelIdx]     = (r - 127.5) / 128.0
                    floatPtr[pixelIdx + 1] = (g - 127.5) / 128.0
                    floatPtr[pixelIdx + 2] = (b - 127.5) / 128.0
                    pixelIdx += 3
                    i += 4
                }
            }
        }

        do {
            try interpreter.copy(inputData, toInputAt: 0)
            try interpreter.invoke()
            let outputTensor = try interpreter.output(at: 0)
            let embedding: [Double] = outputTensor.data.withUnsafeBytes { rawBuffer in
                let floats = rawBuffer.bindMemory(to: Float32.self)
                return floats.map { Double($0) }
            }
            onLivenessSuccess?(["embedding": embedding])
        } catch {
            NSLog("[FaceCameraView] TFLite inference error: \(error)")
            onLivenessFailed?(["error": "Embedding extraction failed: \(error.localizedDescription)"])
            stateLock.lock(); isFinished = false; stateLock.unlock()
        }
    }

    // MARK: - Vision Landmark Helpers

    /**
     * Estimates eye openness probability from VNFaceLandmarkRegion2D eye points.
     *
     * Algorithm: Computes the Eye Aspect Ratio (EAR) — the ratio of vertical eye
     * landmark distances to horizontal eye landmark distance. For 6-point eye landmarks:
     *   EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
     *
     * When the eye is open, EAR ≈ 0.25–0.35. When closed, EAR ≈ 0.02–0.05.
     * We scale this to match Android ML Kit's [0, 1] probability output:
     *   - Closed: < 0.15
     *   - Open: > 0.65
     *
     * Calibration factor 3.0 maps: 0.05*3.0=0.15 (closed), 0.25*3.0=0.75 (open) ✓
     */
    private func estimateEyeOpenness(_ eye: VNFaceLandmarkRegion2D?) -> Float {
        guard let pts = eye?.normalizedPoints, pts.count >= 6 else {
            // Fallback for fewer points: use simple bounding box ratio
            guard let pts = eye?.normalizedPoints, pts.count >= 4 else { return 1.0 }
            let ys = pts.map { $0.y }
            let xs = pts.map { $0.x }
            let vertSpan = (ys.max() ?? 0) - (ys.min() ?? 0)
            let horizSpan = (xs.max() ?? 1) - (xs.min() ?? 0)
            guard horizSpan > 0 else { return 1.0 }
            return Float(min(1.0, (vertSpan / horizSpan) * 3.5))
        }

        // Vision framework eye landmarks: points arranged around the eye contour
        // Use EAR (Eye Aspect Ratio) with top/bottom midpoint distances
        let sortedByX = pts.sorted { $0.x < $1.x }
        let leftCorner = sortedByX.first!
        let rightCorner = sortedByX.last!
        let horizDist = CGFloat(hypot(
            Double(rightCorner.x - leftCorner.x),
            Double(rightCorner.y - leftCorner.y)
        ))
        guard horizDist > 0.001 else { return 1.0 }

        // Get top and bottom points (by y-coordinate, excluding corners)
        let middlePoints = Array(sortedByX.dropFirst().dropLast())
        if middlePoints.count >= 2 {
            let sortedByY = middlePoints.sorted { $0.y < $1.y }
            let bottomPt = sortedByY.first!  // lowest y
            let topPt = sortedByY.last!      // highest y
            let vertDist = CGFloat(topPt.y - bottomPt.y)
            let ear = vertDist / horizDist
            // Scale to [0, 1] range matching ML Kit probabilities
            return Float(min(1.0, max(0.0, ear * 3.0)))
        }

        // Fallback: simple bounding box ratio
        let ys = pts.map { $0.y }
        let vertSpan = (ys.max() ?? 0) - (ys.min() ?? 0)
        return Float(min(1.0, (vertSpan / horizDist) * 3.0))
    }

    /**
     * Estimates smile probability from outer lips landmarks.
     *
     * A genuine smile is characterized by:
     * 1. Wider mouth (lip corners pulled laterally)
     * 2. Raised lip corners relative to center bottom
     * 3. Increased mouth opening (vertical span)
     *
     * Algorithm: Combines mouth width-to-face-width ratio with corner elevation.
     * The outer lips in Vision have ~16 points forming the lip contour.
     *
     * Primary metric: horizSpan / vertSpan ratio. A smile widens the mouth more
     * than it opens vertically, giving a higher width:height ratio.
     * Neutral mouth: width/height ≈ 2.5-3.0
     * Smiling mouth: width/height ≈ 4.0-6.0+
     *
     * We normalize: (ratio - 2.5) / 3.5, clamped to [0, 1]
     * This gives: neutral=0.0, mild smile=0.4, full smile=0.8+
     */
    private func estimateSmile(_ lips: VNFaceLandmarkRegion2D?) -> Float {
        guard let pts = lips?.normalizedPoints, pts.count >= 6 else { return 0.0 }

        let ys = pts.map { $0.y }
        let xs = pts.map { $0.x }
        let vertSpan = (ys.max() ?? 0) - (ys.min() ?? 0)
        let horizSpan = (xs.max() ?? 0) - (xs.min() ?? 0)

        guard vertSpan > 0.001 && horizSpan > 0.001 else { return 0.0 }

        // Width-to-height ratio of the mouth region
        let widthHeightRatio = horizSpan / vertSpan

        // Normalize to probability-like [0, 1] range
        // Neutral: ratio ~2.5-3.0 → score ~0.0-0.14
        // Smile:   ratio ~4.0+   → score ~0.43+
        // Big smile: ratio ~5.5+ → score ~0.86+
        let score = (widthHeightRatio - 2.5) / 3.5
        return Float(min(1.0, max(0.0, score)))
    }

    // MARK: - Image Utilities

    /**
     * Crops a face region from the pixel buffer and returns a CGImage.
     * The pixel buffer is in BGRA format (32 bits per pixel).
     * Returns nil if the crop region is invalid.
     */
    private func cropPixelBuffer(
        _ pixelBuffer: CVPixelBuffer,
        x: Int, y: Int, width: Int, height: Int
    ) -> CGImage? {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return nil }
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let totalWidth = CVPixelBufferGetWidth(pixelBuffer)
        let totalHeight = CVPixelBufferGetHeight(pixelBuffer)

        // Clamp crop region to valid pixel buffer bounds
        let clampedX = max(0, min(x, totalWidth - 1))
        let clampedY = max(0, min(y, totalHeight - 1))
        let clampedW = min(width, totalWidth - clampedX)
        let clampedH = min(height, totalHeight - clampedY)
        guard clampedW > 0 && clampedH > 0 else { return nil }

        // Create a CGImage from the full pixel buffer, then crop
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        // BGRA format: use byteOrder32Little + premultipliedFirst = standard iOS BGRA
        let bitmapInfo = CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)

        guard let fullContext = CGContext(
            data: baseAddress,
            width: totalWidth,
            height: totalHeight,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ) else { return nil }

        guard let fullImage = fullContext.makeImage() else { return nil }

        // Crop the face region from the full image
        let cropRect = CGRect(x: clampedX, y: clampedY, width: clampedW, height: clampedH)
        return fullImage.cropping(to: cropRect)
    }

    /**
     * Resizes a CGImage to the target size (112x112) and returns raw BGRA pixel data.
     * Uses Core Graphics bilinear interpolation for high-quality downscaling.
     * The returned Data contains width * height * 4 bytes in BGRA order.
     */
    private func resizeImage(_ image: CGImage, to size: CGSize) -> Data? {
        let w = Int(size.width)
        let h = Int(size.height)
        let bytesPerRow = w * 4

        // Allocate output buffer for BGRA pixels
        var pixelData = Data(count: h * bytesPerRow)

        let success = pixelData.withUnsafeMutableBytes { dest -> Bool in
            guard let baseAddress = dest.baseAddress else { return false }

            let colorSpace = CGColorSpaceCreateDeviceRGB()
            // Use BGRA format matching our pixel buffer input format
            let bitmapInfo = CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)

            guard let ctx = CGContext(
                data: baseAddress,
                width: w,
                height: h,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: bitmapInfo.rawValue
            ) else { return false }

            // High quality interpolation for face resize
            ctx.interpolationQuality = .high

            // Draw the cropped face image scaled to 112x112
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }

        return success ? pixelData : nil
    }
}
