import UIKit
import Capacitor
import SendIntentPlugin
import FirebaseCore

/*
 Konzolový šum na iOS / simulátoru (často nejde „opravit“ v aplikaci):
 - RTIInputSystemClient — relace klávesnice u WKWebView / textarea.
 - WebKit.Networking, WebPrivacy „missing data“ — systémové služby / ochrana soukromí.
 - CA Event / app launch measurements — metriky Apple.
 - Autolayout u TUIKeyboard / „Unable to simultaneously satisfy constraints“ — interní klávesnice; systém si vybere rozbité constraint.
 - CHHapticPattern / hapticpatternlibrary — simulátor bez haptiky nebo chybějící knihovna v systému.
 - WEBP decode err=-50 — vadný nebo nepodporovaný obrázek v obsahu stránky (opravit konkrétní asset na webu).
*/

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    let shareStore = ShareStore.store
    private let lastIncomingURLPreferencesKey = "CapacitorStorage.aidvisora.lastIncomingURL"

    /// FCM: jen když je `GoogleService-Info.plist` v App target (`docs/runbook-push.md`).
    /// **Ne** v `init()` — `UIApplication.shared.delegate` musí být nastavený, jinak GoogleUtilities
    /// swizzler hlásí `I-SWZ001014` (App Delegate does not conform…) a swizzling selže.
    private static func configureFirebaseIfNeeded() {
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            return
        }
        if FirebaseApp.app() != nil {
            return
        }
        FirebaseApp.configure()
    }

    @discardableResult
    func handleIncomingURL(
        _ url: URL,
        app: UIApplication,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        persistIncomingURLForWebBridge(url)
        let success = ApplicationDelegateProxy.shared.application(app, open: url, options: options)
        processSharedItems(from: url)
        return success
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // První řádek: delegate je již nastavený — Firebase Swizzler v `configure()` očekává platný `UIApplicationDelegate`.
        Self.configureFirebaseIfNeeded()
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") == nil {
            NSLog(
                "[Aidvisora] GoogleService-Info.plist missing from bundle — Firebase not configured; push disabled. Add plist to App target Copy Bundle Resources (runbook-push.md)."
            )
        }
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return handleIncomingURL(url, app: app, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        if let url = userActivity.webpageURL {
            persistIncomingURLForWebBridge(url)
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func persistIncomingURLForWebBridge(_ url: URL) {
        guard shouldPersistIncomingURL(url) else { return }
        UserDefaults.standard.set(url.absoluteString, forKey: lastIncomingURLPreferencesKey)
        UserDefaults.standard.synchronize()
    }

    private func shouldPersistIncomingURL(_ url: URL) -> Bool {
        if url.scheme == "aidvisor" || url.scheme == "aidvisora" {
            return true
        }
        if (url.scheme == "https" || url.scheme == "http"),
           let host = url.host,
           host == "aidvisora.cz" || host == "www.aidvisora.cz" {
            return true
        }
        return false
    }

    private func processSharedItems(from url: URL) {
        guard let components = NSURLComponents(url: url, resolvingAgainstBaseURL: true),
              let params = components.queryItems else {
            return
        }

        let titles = params.filter { $0.name == "title" }
        let descriptions = params.filter { $0.name == "description" }
        let types = params.filter { $0.name == "type" }
        let urls = params.filter { $0.name == "url" }

        shareStore.shareItems.removeAll()
        if !titles.isEmpty {
            for index in 0 ..< titles.count {
                var shareItem: JSObject = JSObject()
                shareItem["title"] = titles[index].value ?? ""
                shareItem["description"] = index < descriptions.count ? (descriptions[index].value ?? "") : ""
                shareItem["type"] = index < types.count ? (types[index].value ?? "") : ""
                shareItem["url"] = index < urls.count ? (urls[index].value ?? "") : ""
                shareStore.shareItems.append(shareItem)
            }
        }

        shareStore.processed = false
        NotificationCenter.default.post(name: Notification.Name("triggerSendIntent"), object: nil)
    }

}
