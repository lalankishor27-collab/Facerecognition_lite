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
  
  @objc func reset(_ node: NSNumber) {
    DispatchQueue.main.async {
      if let bridge = self.bridge,
         let uiManager = bridge.uiManager,
         let view = uiManager.view(forReactTag: node) as? FaceCameraView {
        view.resetLiveness()
      }
    }
  }
}
