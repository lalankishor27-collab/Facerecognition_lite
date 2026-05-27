import Foundation
import UIKit
import AVFoundation
import React

/**
 * FaceCameraView - iOS native camera view for facial recognition & liveness detection.
 *
 * Fixes applied:
 * - #34: super.frame = frame → super.init(frame: frame)
 * - #6: Added AVFoundation camera session setup (camera preview works on real device)
 * - Liveness challenge emitting for UI interaction
 *
 * NOTE: Full face detection and TFLite inference requires adding
 * Apple Vision framework and CoreML model integration.
 * This implementation provides camera preview + challenge flow structure.
 */
class FaceCameraView: UIView {

    @objc var onLivenessStarted: RCTDirectEventBlock?
    @objc var onChallengeComplete: RCTDirectEventBlock?
    @objc var onLivenessSuccess: RCTDirectEventBlock?
    @objc var onLivenessFailed: RCTDirectEventBlock?

    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var session: AVCaptureSession?
    private var videoOutput: AVCaptureVideoDataOutput?

    private var activeChallenges: [String] = []
    private var currentChallengeIdx = 0
    private var isFinished = false
    private var livenessTimer: Timer?

    private static let livenessTimeoutSeconds: TimeInterval = 30.0

    // #34 Fix: Proper super.init(frame:) call
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
        setupCamera()
    }

    // MARK: - Camera Setup

    private func setupCamera() {
        let captureSession = AVCaptureSession()
        captureSession.sessionPreset = .high

        // Find front camera
        guard let frontCamera = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .front
        ) else {
            showPlaceholderLabel("No front camera available")
            return
        }

        do {
            let input = try AVCaptureDeviceInput(device: frontCamera)
            if captureSession.canAddInput(input) {
                captureSession.addInput(input)
            }

            // Add video output for frame processing
            let output = AVCaptureVideoDataOutput()
            output.setSampleBufferDelegate(nil, queue: DispatchQueue(label: "com.securefaceapp.camera"))
            output.alwaysDiscardsLateVideoFrames = true
            if captureSession.canAddOutput(output) {
                captureSession.addOutput(output)
            }
            videoOutput = output

            // Setup preview layer
            let preview = AVCaptureVideoPreviewLayer(session: captureSession)
            preview.videoGravity = .resizeAspectFill
            preview.frame = bounds
            layer.addSublayer(preview)
            previewLayer = preview

            session = captureSession

            // Start session on background thread
            DispatchQueue.global(qos: .userInitiated).async {
                captureSession.startRunning()
            }
        } catch {
            showPlaceholderLabel("Camera initialization failed: \(error.localizedDescription)")
        }
    }

    private func showPlaceholderLabel(_ text: String) {
        let label = UILabel()
        label.text = text
        label.textColor = .white
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        label.numberOfLines = 0
        label.frame = bounds
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(label)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    // MARK: - Liveness Challenge Logic

    func resetLiveness() {
        cancelTimeout()

        // Pick 2-3 randomized challenges (matching Android behavior)
        let pool = ["blink", "smile", "left", "right"].shuffled()
        let numChallenges = Int.random(in: 2...3)
        activeChallenges = Array(pool.prefix(numChallenges))
        currentChallengeIdx = 0
        isFinished = false

        startTimeout()

        onLivenessStarted?(["challenges": activeChallenges])
    }

    // MARK: - Timeout (#35 Fix)

    private func startTimeout() {
        cancelTimeout()
        livenessTimer = Timer.scheduledTimer(
            withTimeInterval: FaceCameraView.livenessTimeoutSeconds,
            repeats: false
        ) { [weak self] _ in
            guard let self = self, !self.isFinished else { return }
            self.isFinished = true
            self.onLivenessFailed?([
                "error": "Liveness timeout: challenges not completed within 30 seconds"
            ])
        }
    }

    private func cancelTimeout() {
        livenessTimer?.invalidate()
        livenessTimer = nil
    }

    // MARK: - Lifecycle

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            // Start challenges after a brief delay for camera warmup
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.resetLiveness()
            }
        } else {
            // View removed from window - cleanup
            cancelTimeout()
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.session?.stopRunning()
            }
        }
    }

    deinit {
        cancelTimeout()
        session?.stopRunning()
    }
}
