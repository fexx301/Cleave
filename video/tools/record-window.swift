// Records ONE app window (never the screen) with ScreenCaptureKit, so other windows on top never appear.
// Usage: record-window <bundle-id> <title-substring> <output.mov> <stop-file>
// Recording runs until <stop-file> exists (or 15 minutes), then the file is finalised and the stop file removed.
import AppKit
import AVFoundation
import Foundation
import ScreenCaptureKit

final class Finish: NSObject, SCRecordingOutputDelegate {
    var finished = false
    func recordingOutputDidFinishRecording(_ output: SCRecordingOutput) { finished = true }
    func recordingOutput(_ output: SCRecordingOutput, didFailWithError error: Error) {
        FileHandle.standardError.write("recording failed: \(error)\n".data(using: .utf8)!)
        finished = true
    }
}

// A command-line process must connect to the window server before ScreenCaptureKit can list windows.
_ = NSApplication.shared

let args = CommandLine.arguments
guard args.count == 5 else {
    FileHandle.standardError.write("usage: record-window <bundle-id> <title-substring> <out.mov> <stop-file>\n".data(using: .utf8)!)
    exit(2)
}
let (bundleId, titleSub, outPath, stopPath) = (args[1], args[2], args[3], args[4])

let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
guard let window = content.windows
    .filter({ $0.owningApplication?.bundleIdentifier == bundleId && ($0.title ?? "").contains(titleSub) })
    .max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else {
    FileHandle.standardError.write("no \(bundleId) window titled *\(titleSub)*\n".data(using: .utf8)!)
    exit(1)
}

let config = SCStreamConfiguration()
let scale = 2.0  // Retina: record at full pixel density
config.width = Int(window.frame.width * scale)
config.height = Int(window.frame.height * scale)
config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
config.showsCursor = false  // the edit draws its own cursor on the real click targets
config.capturesAudio = false

let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: nil)
let recConfig = SCRecordingOutputConfiguration()
recConfig.outputURL = URL(fileURLWithPath: outPath)
recConfig.outputFileType = .mov
recConfig.videoCodecType = .h264
let finish = Finish()
try stream.addRecordingOutput(SCRecordingOutput(configuration: recConfig, delegate: finish))
try await stream.startCapture()
print("recording window \"\(window.title ?? "")\" \(Int(window.frame.width))x\(Int(window.frame.height)) -> \(outPath)")

let deadline = Date().addingTimeInterval(15 * 60)
while !FileManager.default.fileExists(atPath: stopPath) && Date() < deadline {
    try await Task.sleep(nanoseconds: 200_000_000)
}
try await stream.stopCapture()
for _ in 0..<50 where !finish.finished { try await Task.sleep(nanoseconds: 200_000_000) }
try? FileManager.default.removeItem(atPath: stopPath)
print("saved \(outPath)")
