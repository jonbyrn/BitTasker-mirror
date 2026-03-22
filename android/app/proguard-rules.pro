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
# firebase-ktx Kotlin extension class is not present at compile time when
# using the Java-only firebase-messaging artifact — suppress the R8 warning.
-dontwarn com.google.firebase.ktx.Firebase
-dontwarn com.google.firebase.installations.ktx.InstallationsKt

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

# ---------------------------------------------------------------------------
# AndroidX Credential Manager + capacitor-webauthn (passkey / FIDO2)
# ---------------------------------------------------------------------------
# credentials-play-services-auth registers its CredentialProviderFactory via
# Java ServiceLoader. R8 strips ServiceLoader registrations unless we keep
# both the interface and all concrete provider implementations explicitly.
# Without these rules, minifyEnabled=true causes:
#   "getCredentialAsync no provider dependencies found"
-keep class androidx.credentials.** { *; }
-keep class androidx.credentials.internal.** { *; }
-keepnames class androidx.credentials.playservices.** { *; }
-keep class androidx.credentials.playservices.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep class com.headcount.plugins.webauthn.** { *; }

# Keep ServiceLoader META-INF entries intact
-keepnames class * implements androidx.credentials.CredentialProviderFactory
