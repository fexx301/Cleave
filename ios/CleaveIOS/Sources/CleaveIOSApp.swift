import Darwin
import FirebaseAppCheck
import FirebaseCore
import SwiftUI

@main
struct CleaveIOSApp: App {
    init() {
        #if DEBUG
        if let tokenURL = Bundle.main.url(forResource: "AppCheckDebugToken", withExtension: "txt"),
           let raw = try? String(contentsOf: tokenURL, encoding: .utf8) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                setenv("FIRAAppCheckDebugToken", trimmed, 1)
            }
        }
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
        #endif

        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil,
           FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
