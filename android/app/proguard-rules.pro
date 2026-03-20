# BitTasker ProGuard / R8 rules

# ---------------------------------------------------------------------------
# Crash reporting — preserve source file names and line numbers for Sentry
# ---------------------------------------------------------------------------
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# WebView JavaScript interface
# Capacitor bridges JS to native via annotated methods — must not be stripped
# ---------------------------------------------------------------------------
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ---------------------------------------------------------------------------
# Capacitor core and app package
# ---------------------------------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep class com.bittasker.** { *; }

# ---------------------------------------------------------------------------
# Firebase / Google Play Services
# ---------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# ---------------------------------------------------------------------------
# AndroidX
# ---------------------------------------------------------------------------
-keep class androidx.** { *; }
-dontwarn androidx.**

# ---------------------------------------------------------------------------
# Kotlin (keep metadata for reflection)
# ---------------------------------------------------------------------------
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
