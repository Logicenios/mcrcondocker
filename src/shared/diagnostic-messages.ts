import type { Locale } from "./translations.js";
export const DIAGNOSTIC_MESSAGES = {
  automationRejected: ["Minecraft hat den Automatisierungsbefehl abgelehnt. Originalantwort in der Diagnose prüfen.", "Minecraft rejected the automation command. Check the original response in diagnostics."],
  managementUnavailable: ["Minecraft oder die Verwaltung ist nicht verfügbar.", "Minecraft or management is unavailable."],
  managementInvalid: ["Ungültige Verwaltungsdaten.", "Invalid management data."],
  managementTimeout: ["Minecraft-Start hat das Zeitlimit überschritten. Der Prozess wird nicht beendet.", "Minecraft startup exceeded its deadline. The process will not be killed."],
  managementStale: ["Keine aktuelle Lebenszyklus-Beobachtung.", "No fresh lifecycle observation."],
  managementHold: ["Der Wartungsschutz wurde noch nicht bestätigt.", "Maintenance protection has not been acknowledged yet."],
  managementBusy: ["Ein Verwaltungsvorgang läuft bereits.", "A management operation is already running."],
  managementConfirm: ["Bestätigung erforderlich.", "Confirmation required."],
  managementPlayers: ["Spielerzahl ist nicht sicher null.", "Player count is not verified as zero."],
  generationUnknown: ["Chunky-Status konnte nicht bestätigt werden.", "Chunky status could not be confirmed."],
  powerExternal: ["Start, Stopp und Neustart werden außerhalb des Dashboards verwaltet.", "Start, stop and restart are managed outside the dashboard."],
  mapCodeInvalid: ["Kartencode ungültig oder Zugriff nicht verfügbar.", "Map code invalid or access unavailable."],

  "listUnavailable": ["Kein unterstützter Spielerlisten-Befehl. Serverberechtigungen prüfen und Dashboard neu starten.", "No supported player-list command. Check server permissions and restart the dashboard."],
  "rconRefused": ["Verbindung abgelehnt. Wartet auf Minecraft RCON; Aktivierung und Port prüfen.", "Connection refused. Waiting for Minecraft RCON; check that RCON is enabled and the port is correct."],
  "rconHostNotFound": ["RCON-Host nicht gefunden", "RCON host not found"],
  "rconConnectTimeout": ["Zeitüberschreitung beim Verbinden mit RCON", "Timed out connecting to RCON"],
  "rconReset": ["RCON-Verbindung vom Server getrennt", "RCON connection reset by the server"],
  "rconUnreachable": ["RCON-Host nicht erreichbar", "RCON host is unreachable"],
  "rconSocket": ["RCON-Verbindungsfehler ({code})", "RCON connection error ({code})"],
  "rconClosed": ["RCON-Verbindung geschlossen", "RCON connection closed"],
  "rconAuth": ["RCON-Authentifizierung fehlgeschlagen; Zugangsdaten prüfen", "RCON authentication failed; check credentials"],
  "rconNotAuthenticated": ["RCON-Server meldet: nicht authentifiziert", "RCON server reports: not authenticated"],
  "rconProtocol": ["RCON-Protokollfehler: {error}", "RCON protocol error: {error}"],
  "rconPacketLength": ["Ungültige RCON-Paketlänge {length}", "Invalid RCON packet length {length}"],
  "rconCommandTimeout": ["Zeitüberschreitung bei RCON-Befehl ({milliseconds} ms)", "RCON command timed out ({milliseconds} ms)"],
  "rconStopped": ["RCON-Client wurde beendet", "RCON client stopped"],
  "rconNotConnected": ["Keine RCON-Verbindung", "No RCON connection"],
  "rconTooLong": ["Befehl zu lang (max. {bytes} Bytes)", "Command too long (maximum {bytes} bytes)"],
  "rconWaiting": ["Wartet auf Minecraft RCON", "Waiting for Minecraft RCON"],
  "rconFailure": ["RCON-Anfrage fehlgeschlagen", "RCON request failed"],
  "commandFailure": ["Fehler: {error}", "Error: {error}"],
  "configNumber": ["{field} muss eine Zahl sein", "{field} must be a number"],
  "configRequired": ["{field} ist nicht gesetzt", "{field} is not set"],
  "configPassword": ["DASHBOARD_PASSWORD muss mindestens 8 Zeichen lang sein", "DASHBOARD_PASSWORD must be at least 8 characters long"],
  "apiJson": ["JSON erwartet", "JSON required"],
  "apiOrigin": ["Fremde Herkunft", "Cross-origin request denied"],
  "apiLogin": ["Nicht angemeldet", "Not logged in"],
  "apiOperator": ["Operator-Rechte erforderlich", "Operator permission required"],
  "apiPassword": ["Falsches Passwort", "Incorrect password"],
  "apiRateLimit": ["Zu viele Fehlversuche. Bitte in {minutes} Minute(n) erneut versuchen.", "Too many failed attempts. Please try again in {minutes} minute(s)."],
  "apiBackupMissing": ["Backup nicht gefunden", "Backup not found"],
  "apiBackupName": ["Ungültiger Backup-Name", "Invalid backup name"],
  "apiUserMissing": ["Benutzer unbekannt", "Unknown user"],
  "apiUuid": ["Ungültige UUID", "Invalid UUID"],
  "apiPlayerMissing": ["Spieler unbekannt", "Unknown player"],
  "apiPaused": ["paused (boolean) erwartet", "paused must be a boolean"],
  "apiCommand": ["command erwartet", "command is required"],
  "apiNotFound": ["Nicht gefunden", "Not found"],
  "apiRenderMissing": ["Render-Asset nicht gefunden", "Render asset not found"],
  "apiSkinMissing": ["Skin nicht installiert", "Skin not installed"],
  "apiGuiMissing": ["Kein GUI-Sprite", "No GUI sprite"],
  "apiTextureMissing": ["Keine Textur", "No texture"],
  "apiInvalid": ["Ungültige Anfrage", "Invalid request"],
  "apiInternal": ["Interner Serverfehler", "Internal server error"],
  "blueMapUrlRequired": ["url erwartet", "url is required"],
  "blueMapInvalidUrl": ["Eine vollständige HTTP(S)-URL ohne Benutzername oder Passwort ist erforderlich.", "A complete HTTP(S) URL without a username or password is required."],
  "blueMapHttps": ["Bitte für BlueMap HTTPS verwenden.", "Please use HTTPS for BlueMap."],
  "blueMapMissing": ["BlueMap ist nicht eingerichtet", "BlueMap is not configured"],
  "blueMapAccess": ["Ungültige BlueMap-Zugriffsregel", "Invalid BlueMap access policy"],
  "blueMapOperator": ["Diese BlueMap-URL erfordert eine aktive Dashboard-Anmeldung als Operator. Bitte mit einem Operator-Konto anmelden; ein Minecraft-Spielercode ist nicht erforderlich.", "This BlueMap URL requires an active dashboard login as an operator. Sign in with an operator account; no Minecraft player code is required."],
  "consoleEmpty": ["Leerer Befehl", "Empty command"],
  "consoleNewline": ["Befehl darf keine Zeilenumbrüche enthalten", "Command must not contain line breaks"],
  "authUsername": ["Ungültiger Benutzername", "Invalid username"],
  "authRole": ["Ungültige Rolle", "Invalid role"],
  "authDuplicate": ["Benutzername bereits vergeben", "Username already exists"],
  "authBootstrap": ["Das Administratorkonto wird über DASHBOARD_PASSWORD verwaltet", "The admin account is managed through DASHBOARD_PASSWORD"],
  "authEnabled": ["enabled (boolean) erwartet", "enabled must be a boolean"],
  "authSelf": ["Das eigene Konto kann nicht deaktiviert oder herabgestuft werden", "You cannot disable or demote your own account"],
  "authPassword": ["Passwort muss 8 bis 1024 Bytes lang sein", "Password must be 8 to 1024 bytes long"],
  "actionUuid": ["{field}: ungültige UUID", "{field}: invalid UUID"],
  "actionCoordinate": ["{field}: ungültige Koordinate", "{field}: invalid coordinate"],
  "actionDimension": ["Ungültige Dimension", "Invalid dimension"],
  "actionRequired": ["{field} fehlt", "{field} is required"],
  "actionText": ["{field}: Text erwartet", "{field}: text required"],
  "actionTextLength": ["{field}: höchstens {max} Zeichen", "{field}: maximum {max} characters"],
  "actionExpected": ["Aktion erwartet", "Action required"],
  "actionPlayerName": ["Name des Spielers unbekannt", "Player name is unknown"],
  "actionMode": ["Ungültiger Spielmodus", "Invalid game mode"],
  "actionSameTarget": ["Spieler und Ziel sind gleich", "Player and target are the same"],
  "actionItem": ["Ungültige Item-ID", "Invalid item ID"],
  "actionCount": ["Anzahl muss zwischen 1 und 6400 liegen", "Count must be between 1 and 6400"],
  "actionName": ["Ungültiger Name", "Invalid name"],
  "actionIp": ["Ungültige IP-Adresse", "Invalid IP address"],
  "actionTime": ["Ungültige Uhrzeit", "Invalid time"],
  "actionWeather": ["Ungültiges Wetter", "Invalid weather"],
  "actionDifficulty": ["Ungültige Schwierigkeit", "Invalid difficulty"],
  "actionRule": ["Unbekannte Gamerule", "Unknown game rule"],
  "actionRuleValue": ["Wert muss an/aus oder eine ganze Zahl sein", "Value must be on/off or an integer"],
  "actionUnknown": ["Unbekannte Aktion", "Unknown action"],
  "listLegacyFallback": ["Namespaced-Spielerliste nicht unterstützt; verwende /list uuids bis zum Dashboard-Neustart", "Namespaced player list is unsupported; using /list uuids until the dashboard restarts"],

  "snapshotCorrupt": [
    "Gespeicherter Datenstand ist beschädigt",
    "Stored player snapshot is corrupt"
  ],
  "pollCrash": [
    "Fehler im Abfragezyklus: {error}",
    "Polling cycle failed: {error}"
  ],
  "listNoUuid": [
    "Spieler \"{name}\" ohne UUID in /list – wird übersprungen",
    "Player \"{name}\" has no UUID in /list and will be skipped"
  ],
  "noTps": [
    "Der Server kennt /tps nicht (kein Paper?) – TPS wird nicht angezeigt",
    "The server does not support /tps (not Paper?). TPS will not be displayed"
  ],
  "noMspt": [
    "Der Server kennt /mspt nicht (kein Paper?) – MSPT wird nicht angezeigt",
    "The server does not support /mspt (not Paper?). MSPT will not be displayed"
  ],
  "listTruncated": [
    "/list ist gekürzt und die vollständige Spielerliste konnte nicht gelesen werden",
    "/list was truncated and the complete player list could not be read"
  ],
  "dumpFailed": [
    "Spielerdaten konnten nicht vollständig gelesen werden – nur Basiswerte (Rückfallweg)",
    "Could not read complete player data; showing basic values (fallback)"
  ],
  "listUnreadable": [
    "Antwort auf /list konnte nicht gelesen werden",
    "Could not parse the /list response"
  ],
  "listLeftover": [
    "Teil der /list-Antwort nicht zuordenbar",
    "Part of the /list response could not be identified"
  ],
  "listCountMismatch": [
    "/list meldet {online} Spieler, gelesen wurden {parsed}",
    "/list reports {online} players; parsed {parsed}"
  ],
  "tpsUnreadable": [
    "Antwort auf /tps konnte nicht gelesen werden",
    "Could not parse the /tps response"
  ],
  "tpsNoNumbers": [
    "Antwort auf /tps enthielt keine Zahlen",
    "The /tps response contained no numbers"
  ],
  "msptUnreadable": [
    "Antwort auf /mspt konnte nicht gelesen werden",
    "Could not parse the /mspt response"
  ],
  "entityUnreadable": [
    "Spielerdaten-Antwort konnte nicht gelesen werden",
    "Could not parse the player-data response"
  ],
  "entityUnknownPrefix": [
    "Spielerdaten-Antwort hat ein unbekanntes Format, versuche trotzdem zu lesen",
    "Player-data response has an unknown prefix; attempting to parse it"
  ],
  "entityNotCompound": [
    "Spielerdaten sind kein Compound",
    "Player data is not a compound"
  ],
  "entityTruncated": [
    "Spielerdaten waren abgeschnitten – es wird nur ein Teil angezeigt",
    "Player data was truncated; showing partial data"
  ],
  "entityParseError": [
    "SNBT-Fehler an Position {position}: {error}",
    "SNBT error at position {position}: {error}"
  ],
  "entityTrailing": [
    "Nach den Spielerdaten folgte weiterer Text",
    "Additional text followed the player data"
  ],
  "itemNotCompound": [
    "Item an {path} hat ein unerwartetes Format",
    "Item at {path} has an unexpected format"
  ],
  "itemNoId": [
    "Item ohne \"id\" an {path} wird übersprungen",
    "Item without an ID at {path} will be skipped"
  ],
  "unknownComponent": [
    "Unbekannte Item-Komponente \"{component}\" wird ignoriert",
    "Unknown item component \"{component}\" will be ignored"
  ],
  "itemListNotList": [
    "{path} ist keine Liste",
    "{path} is not a list"
  ],
  "unknownPlayerField": [
    "Unbekanntes Spielerfeld \"{field}\" wird ignoriert",
    "Unknown player field \"{field}\" will be ignored"
  ],
  "playerNoPos": [
    "Spielerdaten ohne lesbare Position (Pos)",
    "Player data has no readable position (Pos)"
  ],
  "playerNoDimension": [
    "Spielerdaten ohne Dimension",
    "Player data has no dimension"
  ],
  "playerNoHealth": [
    "Spielerdaten ohne Health",
    "Player data has no Health value"
  ],
  "inventorySlot": [
    "Inventar-Slot {slot} unbekannt (Item {item})",
    "Unknown inventory slot {slot} (item {item})"
  ],
  "playerNoInventory": [
    "Spielerdaten ohne Inventory",
    "Player data has no Inventory"
  ],
  "unknownEquipment": [
    "Unbekannter Ausrüstungsplatz \"{slot}\"",
    "Unknown equipment slot \"{slot}\""
  ],
  "snbtEndInput": [
    "Unerwartetes Ende der Eingabe",
    "Unexpected end of input"
  ],
  "snbtTruncated": [
    "Ausgabe abgekürzt (...)",
    "Output truncated (...)"
  ],
  "snbtEndCompound": [
    "Unerwartetes Ende in Compound",
    "Unexpected end inside compound"
  ],
  "snbtColon": [
    "':' nach Schlüssel \"{key}\" erwartet",
    "Expected ':' after key \"{key}\""
  ],
  "snbtCompoundSeparator": [
    "',' oder '}' erwartet, gefunden '{character}'",
    "Expected ',' or '}', found '{character}'"
  ],
  "snbtEndList": [
    "Unerwartetes Ende in Liste",
    "Unexpected end inside list"
  ],
  "snbtListSeparator": [
    "',' oder ']' erwartet, gefunden '{character}'",
    "Expected ',' or ']', found '{character}'"
  ],
  "snbtKey": [
    "Schlüssel erwartet, gefunden '{character}'",
    "Expected key, found '{character}'"
  ],
  "snbtString": [
    "String nicht abgeschlossen",
    "Unterminated string"
  ],
  "snbtValue": [
    "Wert erwartet, gefunden '{character}'",
    "Expected value, found '{character}'"
  ]
} as const;
export interface DiagnosticMessage {
  id: keyof typeof DIAGNOSTIC_MESSAGES;
  params?: Record<string, string | number>;
  children?: Record<string, DiagnosticMessage>;
}
export function diagnostic(id: DiagnosticMessage["id"], params?: DiagnosticMessage["params"], children?: DiagnosticMessage["children"]): DiagnosticMessage {
  return { id, ...(params ? { params } : {}), ...(children ? { children } : {}) };
}
export function formatDiagnostic(locale: Locale, message: DiagnosticMessage): string {
  const params = { ...message.params };
  for (const [key, child] of Object.entries(message.children ?? {})) params[key] = formatDiagnostic(locale, child);
  const template = DIAGNOSTIC_MESSAGES[message.id]?.[locale === "de" ? 0 : 1] ?? message.id;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(params, key) ? String(params[key]) : match);
}

/** Owned backend errors carry stable identifiers; Error.message stays English for logs. */
export class DiagnosticError extends Error {
  readonly messageData: DiagnosticMessage;
  constructor(id: DiagnosticMessage["id"], params?: DiagnosticMessage["params"], children?: DiagnosticMessage["children"]) {
    const data = diagnostic(id, params, children);
    super(formatDiagnostic("en", data));
    this.messageData = data;
  }
}
