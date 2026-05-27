#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(FaceCameraViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(onLivenessStarted, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onChallengeComplete, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLivenessSuccess, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLivenessFailed, RCTDirectEventBlock)

RCT_EXTERN_METHOD(reset:(nonnull NSNumber *)node)

@end
