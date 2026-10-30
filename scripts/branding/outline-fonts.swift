// Extract actual glyph outlines on macOS; no font binaries are redistributed.
// Usage: swift outline-fonts.swift <MapleMono-SemiBold.ttf> <jf-openhuninn-2.1.ttf>
import Foundation
import CoreText
import CoreGraphics

func font(_ file:String,_ size:CGFloat)->CTFont {
 let provider=CGDataProvider(url:URL(fileURLWithPath:file) as CFURL)!
 let graphics=CGFont(provider)!
 return CTFontCreateWithGraphicsFont(graphics,size,nil,nil)
}
func outline(_ f:CTFont,_ text:String)->[[String:Any]] {
 let chars=Array(text.utf16);var glyphs=[CGGlyph](repeating:0,count:chars.count)
 precondition(CTFontGetGlyphsForCharacters(f,chars,&glyphs,chars.count),"Missing glyph")
 var out=[[String:Any]]();var x:CGFloat=0
 for (i,glyph) in glyphs.enumerated(){
  let p=CTFontCreatePathForGlyph(f,glyph,nil)!
  var parts=[String]();var transform=CGAffineTransform(a:1,b:0,c:0,d:-1,tx:x,ty:88)
  let transformed=p.copy(using:&transform)!
  func n(_ v:CGFloat)->String{String(format:"%.3f",Double(v))}
  func pt(_ p:CGPoint)->String{"\(n(p.x)) \(n(p.y))"}
  transformed.applyWithBlock{pointer in let e=pointer.pointee
   switch e.type {
   case .moveToPoint:parts.append("M \(pt(e.points[0]))")
   case .addLineToPoint:parts.append("L \(pt(e.points[0]))")
   case .addQuadCurveToPoint:parts.append("Q \(pt(e.points[0])) \(pt(e.points[1]))")
   case .addCurveToPoint:parts.append("C \(pt(e.points[0])) \(pt(e.points[1])) \(pt(e.points[2]))")
   case .closeSubpath:parts.append("Z")
   @unknown default:fatalError("Unsupported path")
   }
  }
  var g=glyph;var advance=CGSize.zero;CTFontGetAdvancesForGlyphs(f,.horizontal,&g,&advance,1)
  out.append(["character":String(UnicodeScalar(chars[i])!),"path":parts.joined(separator:" "),"advance":advance.width])
  x+=advance.width
 }
 return out
}
let args=CommandLine.arguments
precondition(args.count == 3, "Expected Latin and Chinese font-file arguments")
let english=font(args[1],110),chinese=font(args[2],108)
let result:[String:Any] = ["latin":outline(english,"Niu"),"chinese":outline(chinese,"牛元"),"latinFamily":CTFontCopyPostScriptName(english),"chineseFamily":CTFontCopyPostScriptName(chinese)]
let data=try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys])
FileHandle.standardOutput.write(data)
