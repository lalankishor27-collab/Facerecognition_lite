import Foundation
import UIKit
import AVFoundation
import React

class FaceCameraView: UIView {
  
  @objc var onLivenessStarted: RCTDirectEventBlock?
  @objc var onChallengeComplete: RCTDirectEventBlock?
  @objc var onLivenessSuccess: RCTDirectEventBlock?
  @objc var onLivenessFailed: RCTDirectEventBlock?
  
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var session: AVCaptureSession?
  
  private var activeChallenges: [String] = []
  private var currentChallengeIdx = 0
  private var isFinished = false
  
  override init(frame: CGRect) {
    super.frame = frame
    setupView()
  }
  
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupView()
  }
  
  private func setupView() {
    backgroundColor = .black
    
    // Label for visual confirmation in simulator/placeholder state
    let label = UILabel()
    label.text = "Offline Face Recognition Camera"
    label.textColor = .white
    label.textAlignment = .center
    label.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
    label.frame = bounds
    label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(label)
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }
  
  func resetLiveness() {
    // Pick one challenge randomly for ultra-fast verification (<1s)
    let randomChallenge = Bool.random() ? "blink" : "smile"
    activeChallenges = [randomChallenge]
    currentChallengeIdx = 0
    isFinished = false
    
    if let onLivenessStarted = onLivenessStarted {
      onLivenessStarted(["challenges": activeChallenges])
    }
  }
  
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      // Simulate initial startup call matching Android behavior
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        self.resetLiveness()
      }
    }
  }
}
