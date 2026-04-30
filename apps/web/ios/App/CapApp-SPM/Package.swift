// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.2.0"),
        .package(name: "CapacitorApp", path: "./spm-path-aliases/capacitor-core-app"),
        .package(name: "CapacitorAppLauncher", path: "../../../../../node_modules/@capacitor/app-launcher"),
        .package(name: "CapacitorBrowser", path: "../../../../../node_modules/@capacitor/browser"),
        .package(name: "CapacitorCamera", path: "../../../../../node_modules/@capacitor/camera"),
        .package(name: "CapacitorDevice", path: "../../../../../node_modules/@capacitor/device"),
        .package(name: "CapacitorHaptics", path: "../../../../../node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../../../node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorNetwork", path: "../../../../../node_modules/@capacitor/network"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/@capacitor/preferences"),
        .package(name: "CapacitorShare", path: "../../../../../node_modules/@capacitor/share"),
        .package(name: "CapacitorFirebaseApp", path: "./spm-path-aliases/capacitor-firebase-app-plugin"),
        .package(name: "CapacitorFirebaseMessaging", path: "../../../../../node_modules/@capacitor-firebase/messaging"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../../../node_modules/@capacitor/status-bar"),
        .package(name: "CapgoCapacitorDocumentScanner", path: "../../../../../node_modules/@capgo/capacitor-document-scanner"),
        .package(name: "SupernotesCapacitorSendIntent", path: "../../../../../node_modules/@supernotes/capacitor-send-intent")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorAppLauncher", package: "CapacitorAppLauncher"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorFirebaseApp", package: "CapacitorFirebaseApp"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapgoCapacitorDocumentScanner", package: "CapgoCapacitorDocumentScanner"),
                .product(name: "SupernotesCapacitorSendIntent", package: "SupernotesCapacitorSendIntent")
            ]
        )
    ]
)
