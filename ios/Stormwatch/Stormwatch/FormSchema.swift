import Foundation

/// The questions on a report, read from the Survey123 form itself (the form item's public form.json).
/// The web form and this app ask the same questions, with the same choices, required answers and
/// show-when rules. A change published from Survey123 shows up here the next time the app opens with a
/// connection; no new app build is needed. A copy of each form ships with the app for first launch offline.
struct FormSchema: Codable {
    struct Choice: Codable, Hashable, Identifiable {
        let value: String
        let label: String
        var id: String { value }
    }

    struct Question: Codable, Identifiable, Hashable {
        enum Kind: String, Codable { case text, longText, choice, number, integer, date, photo }
        let name: String
        let field: String
        let label: String
        let kind: Kind
        let required: Bool
        let maxLength: Int?
        let choices: [Choice]
        /// Survey123's "Other" option: the field that holds the typed-in answer, and its label.
        let otherField: String?
        let otherLabel: String?
        /// Show-when rule from the form, e.g. `${type} = 'power_lines_down'`. Nil means always shown.
        let visibleWhen: String?
        /// Remember the answer for the next report (Survey123 "cached answer"), e.g. name and phone.
        let remember: Bool
        /// Photo questions: most photos allowed.
        let maxPhotos: Int
        var id: String { name }
    }

    let questions: [Question]
    let locationLabel: String
    let fetched: Date

    var photo: Question? { questions.first { $0.kind == .photo } }

    // MARK: Reading form.json

    init(formJSON data: Data, fetched: Date) throws {
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let qs = j["questions"] as? [[String: Any]] else { throw CocoaError(.coderReadCorrupt) }
        var out: [Question] = []
        var loc = "Location"
        for q in qs {
            let type = q["type"] as? String ?? ""
            let name = q["name"] as? String ?? ""
            let label = Self.plain(q["label"] as? String ?? name)
            let req = ((q["required"] as? [String: Any])?["expression"] as? String) == "true()"
            let vis = (q["visibility"] as? [String: Any])?["expression"] as? String
            let field = q["fieldName"] as? String ?? name
            let len = q["fieldLength"] as? Int
            let remember = q["isCachedAnswer"] as? Bool ?? false
            var kind: Question.Kind
            var choices: [Choice] = []
            var otherField: String?, otherLabel: String?
            var maxPhotos = 0
            switch type {
            case "esriQuestionTypeText", "esriQuestionTypeEmail", "esriQuestionTypeWebsite", "esriQuestionTypeBarcode": kind = .text
            case "esriQuestionTypeTextArea": kind = .longText
            case "esriQuestionTypeNumber": kind = .number
            case "esriQuestionTypeInteger": kind = .integer
            case "esriQuestionTypeDate", "esriQuestionTypeDateTime": kind = .date
            case "esriQuestionTypeSingleChoice", "esriQuestionTypeDropdown":
                kind = .choice
                var c = q["choices"]
                if let s = c as? String { c = try? JSONSerialization.jsonObject(with: Data(s.utf8)) }
                let cd = c as? [String: Any] ?? [:]
                choices = (cd["items"] as? [[String: Any]] ?? []).map { Choice(value: "\($0["value"] ?? "")", label: Self.plain($0["label"] as? String ?? "")) }
                if let o = cd["other"] as? [String: Any], o["isEnabled"] as? Bool == true {
                    choices.append(Choice(value: o["value"] as? String ?? "other", label: "Other"))
                    otherField = o["fieldName"] as? String
                    otherLabel = Self.plain(o["label"] as? String ?? "Other")
                }
            case "esriQuestionTypeImage":
                kind = .photo
                let cons = ((q["validation"] as? [String: Any])?["constraint"] as? [String: Any])?["expression"] as? String ?? ""
                maxPhotos = cons.range(of: #"<=\s*(\d+)"#, options: .regularExpression).flatMap { Int(cons[$0].filter(\.isNumber)) } ?? 5
            case "esriQuestionTypeGeoPoint":
                loc = label
                continue
            default:
                continue // notes, hidden and calculated questions
            }
            if vis == "false()" { continue }
            out.append(Question(name: name, field: field, label: label, kind: kind, required: req, maxLength: len,
                                choices: choices, otherField: otherField, otherLabel: otherLabel,
                                visibleWhen: (vis == nil || vis == "true()") ? nil : vis, remember: remember, maxPhotos: maxPhotos))
        }
        guard !out.isEmpty else { throw CocoaError(.coderReadCorrupt) }
        questions = out
        locationLabel = loc
        self.fetched = fetched
    }

    /// Labels can carry HTML from the Survey123 web designer.
    static func plain(_ s: String) -> String {
        s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ").replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Show-when rules

    /// Evaluates the simple Survey123 rules these forms use:
    /// `${q} = 'v'`, `${q} != 'v'`, `selected(${q}, 'v')`, `string-length(${q}) > 0`, joined with `and` / `or`.
    /// Anything else is shown, so a question is never hidden by mistake.
    static func visible(_ expr: String?, _ answers: [String: String]) -> Bool {
        guard let e = expr?.trimmingCharacters(in: .whitespaces), !e.isEmpty, e != "true()" else { return true }
        if e == "false()" { return false }
        let ors = e.components(separatedBy: " or ")
        if ors.count > 1 { return ors.contains { visible($0, answers) } }
        let ands = e.components(separatedBy: " and ")
        if ands.count > 1 { return ands.allSatisfy { visible($0, answers) } }
        let t = e.trimmingCharacters(in: CharacterSet(charactersIn: "() "))
        func ref(_ s: String) -> String? {
            s.range(of: #"\$\{([^}]+)\}"#, options: .regularExpression).map { String(s[$0].dropFirst(2).dropLast()) }
        }
        func lit(_ s: String) -> String? {
            s.range(of: #"'[^']*'"#, options: .regularExpression).map { String(s[$0].dropFirst().dropLast()) }
        }
        if t.hasPrefix("selected"), let q = ref(t), let v = lit(t) {
            return (answers[q] ?? "").split(separator: ",").map(String.init).contains(v)
        }
        if t.hasPrefix("string-length"), let q = ref(t) { return !(answers[q] ?? "").isEmpty }
        if let r = t.range(of: "!=") , let q = ref(String(t[..<r.lowerBound])), let v = lit(String(t[r.upperBound...])) {
            return (answers[q] ?? "") != v
        }
        if let r = t.range(of: "="), let q = ref(String(t[..<r.lowerBound])), let v = lit(String(t[r.upperBound...])) {
            return (answers[q] ?? "") == v
        }
        return true
    }

    // MARK: Cache and built-in copy

    static func cached(_ kind: ReportKind) -> FormSchema? {
        guard let d = UserDefaults.standard.data(forKey: "form.\(kind.rawValue)") else { return nil }
        return try? JSONDecoder().decode(FormSchema.self, from: d)
    }

    func cache(_ kind: ReportKind) {
        if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: "form.\(kind.rawValue)") }
    }

    static func builtIn(_ kind: ReportKind) -> FormSchema {
        let url = Bundle.main.url(forResource: "Form-\(kind.rawValue)", withExtension: "json")!
        return try! FormSchema(formJSON: Data(contentsOf: url), fetched: .distantPast)
    }
}

@MainActor
final class Schemas: ObservableObject {
    static let shared = Schemas()
    @Published private(set) var forms: [ReportKind: FormSchema] = [:]
    @Published private(set) var error: String?

    init() {
        for k in ReportKind.allCases { forms[k] = FormSchema.cached(k) ?? FormSchema.builtIn(k) }
    }

    func form(_ k: ReportKind) -> FormSchema { forms[k] ?? FormSchema.builtIn(k) }

    /// Re-reads each Survey123 form. Keeps the last good copy if it can't.
    func refresh() async {
        for k in ReportKind.allCases {
            do {
                let url = Config.portal.appendingPathComponent("sharing/rest/content/items/\(k.formItem)/info/form.json")
                let (data, resp) = try await URLSession.shared.data(from: url)
                guard (resp as? HTTPURLResponse)?.statusCode == 200 else { continue }
                let s = try FormSchema(formJSON: data, fetched: Date())
                forms[k] = s
                s.cache(k)
                error = nil
            } catch {
                self.error = "Couldn't check the \(k.title.lowercased()) form for changes. Using the saved copy."
            }
        }
    }
}
