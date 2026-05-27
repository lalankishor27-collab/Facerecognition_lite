# SecureFaceApp ProGuard Rules

# ─── React Native ────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

# ─── TensorFlow Lite ─────────────────────────────────────────────────────────
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-dontwarn org.tensorflow.lite.**

# ─── ML Kit Face Detection ───────────────────────────────────────────────────
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }
-dontwarn com.google.mlkit.**

# ─── CameraX ─────────────────────────────────────────────────────────────────
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ─── App Native Module ───────────────────────────────────────────────────────
-keep class com.securefaceapp.** { *; }

# ─── AsyncStorage ────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ─── General Android ─────────────────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-dontwarn sun.misc.**
-dontwarn java.lang.invoke.**
