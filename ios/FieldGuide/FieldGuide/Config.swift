import Foundation

/// Where the app reads everything from. ArcGIS is the single source of truth:
/// the app holds no guide text of its own beyond a first-launch copy.
enum Config {
    /// The public "EM Field Guide" Experience Builder item. Publishing it in ArcGIS
    /// is what updates the app (EM Watch stays the master; copy changes into this one and publish).
    static let guideItem = "c7e098280d1c497c9b387ea3fe85a90e"

    static let sharing = "https://www.arcgis.com/sharing/rest/content/items/"
    /// Small request, used to see whether the guide was republished.
    static let itemInfo = URL(string: sharing + guideItem + "?f=json")!
    /// The published (not draft) configuration: pages, menu folders and the HTML of every guide page.
    static let publishedConfig = URL(string: sharing + guideItem + "/resources/config/config.json")!
    /// The same guide on the web, for "Open on the web" and for links inside guide pages.
    static let guideWeb = URL(string: "https://experience.arcgis.com/experience/" + guideItem + "/")!

    /// EmergencyInformation_public › Lifeline Status (the one lifeline feed SIGNAL reads). Newest row wins.
    static let lifelineStatus = URL(string: "https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/EmergencyInformation_public_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/1/query?where=1%3D1&outFields=*&orderByFields=OBJECTID%20DESC&resultRecordCount=1&f=json")!

    /// Shared network session: short timeouts so a weak signal never stalls the app.
    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 15
        c.timeoutIntervalForResource = 60
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()
}
