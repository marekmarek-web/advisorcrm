import MobileCoreServices
import Social
import UIKit

final class ShareItem {
    var title: String = ""
    var type: String = ""
    var url: String = ""
}

final class ShareViewController: UIViewController {
    private let appGroupId = "group.cz.aidvisor.app"
    private let appScheme = "aidvisor://share"
    private var shareItems: [ShareItem] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        Task {
            await loadShareItems()
            openHostApp()
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    private func loadShareItems() async {
        shareItems.removeAll()
        guard
            let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
            let attachments = extensionItem.attachments
        else {
            return
        }

        for (index, attachment) in attachments.enumerated() {
            if attachment.hasItemConformingToTypeIdentifier(kUTTypeImage as String) {
                if let item = await loadImage(attachment: attachment, index: index) {
                    shareItems.append(item)
                }
                continue
            }

            if attachment.hasItemConformingToTypeIdentifier(kUTTypePDF as String) {
                if let item = await loadPdf(attachment: attachment) {
                    shareItems.append(item)
                }
            }
        }
    }

    private func loadPdf(attachment: NSItemProvider) async -> ShareItem? {
        do {
            let result = try await attachment.loadItem(forTypeIdentifier: kUTTypePDF as String, options: nil)
            guard let inputUrl = result as? URL else { return nil }
            return createFileShareItem(from: inputUrl, fallbackMime: "application/pdf")
        } catch {
            return nil
        }
    }

    private func loadImage(attachment: NSItemProvider, index: Int) async -> ShareItem? {
        do {
            let result = try await attachment.loadItem(forTypeIdentifier: kUTTypeImage as String, options: nil)
            if let url = result as? URL {
                return createFileShareItem(from: url, fallbackMime: "image/\(url.pathExtension.lowercased())")
            }
            if let image = result as? UIImage {
                return createScreenshotShareItem(image: image, index: index)
            }
            return nil
        } catch {
            return nil
        }
    }

    private func createFileShareItem(from inputUrl: URL, fallbackMime: String) -> ShareItem? {
        guard let groupContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            return nil
        }

        let fileName = inputUrl.lastPathComponent
        let destination = groupContainer.appendingPathComponent(UUID().uuidString + "-" + fileName)
        do {
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: inputUrl, to: destination)
        } catch {
            return nil
        }

        let item = ShareItem()
        item.title = fileName
        item.type = fallbackMime
        item.url = destination.absoluteString
        return item
    }

    private func createScreenshotShareItem(image: UIImage, index: Int) -> ShareItem? {
        guard
            let groupContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId),
            let pngData = image.pngData()
        else {
            return nil
        }

        let fileName = "screenshot_\(index).png"
        let destination = groupContainer.appendingPathComponent(UUID().uuidString + "-" + fileName)
        do {
            try pngData.write(to: destination)
        } catch {
            return nil
        }

        let item = ShareItem()
        item.title = fileName
        item.type = "image/png"
        item.url = destination.absoluteString
        return item
    }

    private func openHostApp() {
        guard var components = URLComponents(string: appScheme) else { return }
        components.queryItems = shareItems.flatMap { item in
            [
                URLQueryItem(name: "title", value: item.title),
                URLQueryItem(name: "description", value: ""),
                URLQueryItem(name: "type", value: item.type),
                URLQueryItem(name: "url", value: item.url),
            ]
        }

        guard let url = components.url else { return }
        _ = openURL(url)
    }

    @objc private func openURL(_ url: URL) -> Bool {
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                return application.perform(#selector(openURL(_:)), with: url) != nil
            }
            responder = responder?.next
        }
        return false
    }
}
