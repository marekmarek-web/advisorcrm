import UIKit
import Capacitor

/**
 * UIScene lifecycle — vyhne se budoucímu assertu z UIKitu a je očekávaný pro iPad multitasking.
 * WKWebView / klávesnice / WebPrivacy hlášky v konzoli jsou většinou systémové; viz komentář v AppDelegate.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        window?.rootViewController = storyboard.instantiateInitialViewController()
        window?.makeKeyAndVisible()

        // Cold-start deep links can arrive before the Capacitor bridge is fully
        // ready. Hopping to the next run loop preserves the launch URL for the
        // App plugin and prevents OAuth callbacks from getting lost.
        if !connectionOptions.urlContexts.isEmpty {
            DispatchQueue.main.async { [weak self] in
                self?.forwardOpenURLContexts(connectionOptions.urlContexts)
            }
        }
        if let activity = connectionOptions.userActivities.first {
            DispatchQueue.main.async {
                _ = ApplicationDelegateProxy.shared.application(
                    UIApplication.shared,
                    continue: activity,
                    restorationHandler: { _ in }
                )
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        forwardOpenURLContexts(URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    /// Předá URL do AppDelegate (Capacitor + SendIntent / share metadata).
    private func forwardOpenURLContexts(_ contexts: Set<UIOpenURLContext>) {
        guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
        for context in contexts {
            _ = appDelegate.handleIncomingURL(context.url, app: UIApplication.shared)
        }
    }
}
