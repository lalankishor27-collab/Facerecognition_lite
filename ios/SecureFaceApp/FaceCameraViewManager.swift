import Foundation
import React

@objc(FaceCameraViewManager)
class FaceCameraViewManager: RCTViewManager {

  override func view() -> UIView! {
    return FaceCameraView()
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  // Command dispatch compatible with both Old and New Architecture
  @objc func reset(_ node: NSNumber) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // Try bridge-based lookup (Old Architecture)
      if let bridge = self.bridge,
         let uiManager = bridge.uiManager,
         let view = uiManager.view(forReactTag: node) as? FaceCameraView {
        view.resetLiveness()
        return
      }

      // Fallback: direct view hierarchy search (New Architecture / Fabric)
      // Uses connectedScenes API (iOS 13+) to avoid deprecated windows.first
      let keyWindow = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }
      if let window = keyWindow,
         let view = self.findFaceCameraView(in: window) {
        view.resetLiveness()
      }
    }
  }

  /// Recursively searches the view hierarchy for a FaceCameraView instance.
  private func findFaceCameraView(in view: UIView) -> FaceCameraView? {
    if let faceCameraView = view as? FaceCameraView {
      return faceCameraView
    }
    for subview in view.subviews {
      if let found = findFaceCameraView(in: subview) {
        return found
      }
    }
    return nil
  }
}
