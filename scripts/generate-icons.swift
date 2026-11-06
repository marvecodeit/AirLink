#!/usr/bin/env swift
import AppKit
import Foundation

let outputDirectory = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "src-tauri/icons"

func pngData(from image: NSImage) -> Data? {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff) else { return nil }
    return rep.representation(using: .png, properties: [:])
}

func save(_ image: NSImage, to path: String) {
    guard let data = pngData(from: image) else {
        fputs("Could not encode \(path)\n", stderr)
        exit(1)
    }
    try! data.write(to: URL(fileURLWithPath: path))
    print("wrote \(path)")
}

func drawWifiMark(center: NSPoint, baseY: CGFloat, scale: CGFloat, color: NSColor,
                  lineWidth: CGFloat, dotRadius: CGFloat) {
    color.setStroke()
    color.setFill()

    let dot = NSBezierPath(ovalIn: NSRect(
        x: center.x - dotRadius,
        y: baseY - dotRadius,
        width: dotRadius * 2,
        height: dotRadius * 2
    ))
    dot.fill()

    for index in 0..<3 {
        let radius = (120 + CGFloat(index) * 120) * scale
        let arc = NSBezierPath()
        arc.appendArc(
            withCenter: NSPoint(x: center.x, y: baseY),
            radius: radius,
            startAngle: 47,
            endAngle: 133
        )
        arc.lineWidth = lineWidth * scale
        arc.lineCapStyle = .round
        arc.stroke()
    }
}

func drawSpark(center: NSPoint, size: CGFloat, color: NSColor) {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: center.x, y: center.y + size))
    path.curve(
        to: NSPoint(x: center.x + size, y: center.y),
        controlPoint1: NSPoint(x: center.x + size * 0.18, y: center.y + size * 0.2),
        controlPoint2: NSPoint(x: center.x + size * 0.2, y: center.y + size * 0.18)
    )
    path.curve(
        to: NSPoint(x: center.x, y: center.y - size),
        controlPoint1: NSPoint(x: center.x + size * 0.2, y: center.y - size * 0.18),
        controlPoint2: NSPoint(x: center.x + size * 0.18, y: center.y - size * 0.2)
    )
    path.curve(
        to: NSPoint(x: center.x - size, y: center.y),
        controlPoint1: NSPoint(x: center.x - size * 0.18, y: center.y - size * 0.2),
        controlPoint2: NSPoint(x: center.x - size * 0.2, y: center.y - size * 0.18)
    )
    path.curve(
        to: NSPoint(x: center.x, y: center.y + size),
        controlPoint1: NSPoint(x: center.x - size * 0.2, y: center.y + size * 0.18),
        controlPoint2: NSPoint(x: center.x - size * 0.18, y: center.y + size * 0.2)
    )
    path.close()
    color.setFill()
    path.fill()
}

// MARK: - Application icon

let appSize: CGFloat = 1024
let appImage = NSImage(size: NSSize(width: appSize, height: appSize))
appImage.lockFocus()

NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: appSize, height: appSize).fill()

let tile = NSBezierPath(
    roundedRect: NSRect(x: 52, y: 52, width: 920, height: 920),
    xRadius: 210,
    yRadius: 210
)
let gradient = NSGradient(colors: [
    NSColor(calibratedRed: 0.118, green: 0.604, blue: 0.290, alpha: 1.0),
    NSColor(calibratedRed: 0.043, green: 0.365, blue: 0.157, alpha: 1.0),
])
gradient?.draw(in: tile, angle: -65)

// A soft highlight across the top of the tile.
let highlight = NSBezierPath(
    roundedRect: NSRect(x: 100, y: 560, width: 824, height: 360),
    xRadius: 180,
    yRadius: 180
)
NSColor.white.withAlphaComponent(0.055).setFill()
highlight.fill()

let white = NSColor(calibratedWhite: 1.0, alpha: 0.97)
drawWifiMark(
    center: NSPoint(x: 500, y: 300),
    baseY: 330,
    scale: 1.0,
    color: white,
    lineWidth: 74,
    dotRadius: 52
)

let mint = NSColor(calibratedRed: 0.72, green: 0.95, blue: 0.78, alpha: 0.96)
drawSpark(center: NSPoint(x: 760, y: 742), size: 92, color: mint)
drawSpark(center: NSPoint(x: 860, y: 592), size: 38, color: mint.withAlphaComponent(0.7))

appImage.unlockFocus()
save(appImage, to: "\(outputDirectory)/app-icon.png")

// MARK: - Menu bar template icon (18 pt, rendered at 4x for crispness)

let traySize: CGFloat = 88
let trayImage = NSImage(size: NSSize(width: traySize, height: traySize))
trayImage.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: traySize, height: traySize).fill()

let black = NSColor.black
drawWifiMark(
    center: NSPoint(x: 42, y: 26),
    baseY: 30,
    scale: 0.19,
    color: black,
    lineWidth: 74,
    dotRadius: 52
)
drawSpark(center: NSPoint(x: 63, y: 73), size: 8, color: black)

trayImage.unlockFocus()
save(trayImage, to: "\(outputDirectory)/tray-icon.png")

// A 128 px copy for the HTML favicon.
let favicon = NSImage(size: NSSize(width: 128, height: 128))
favicon.lockFocus()
let context = NSGraphicsContext.current!.cgContext
context.interpolationQuality = .high
appImage.draw(
    in: NSRect(x: 0, y: 0, width: 128, height: 128),
    from: NSRect(x: 0, y: 0, width: appSize, height: appSize),
    operation: .copy,
    fraction: 1.0
)
favicon.unlockFocus()
save(favicon, to: "public/app-icon.png")
