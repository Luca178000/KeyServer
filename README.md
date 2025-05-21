# KeyServer

Ein einfacher Fastify-Server, der Windows-Keys in einer In-Memory-Liste verwaltet. 

## Installation

### Voraussetzungen

- Node.js ab Version **18**
- Git zum Klonen des Repositories

### Erstinstallation

1. Repository klonen und in das Verzeichnis wechseln:
   ```bash
   git clone https://github.com/Luca178000/KeyServer
   cd KeyServer
   ```
2. Benötigte Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. (Optional) Alle Tests einmal ausführen, um die Umgebung zu prüfen:
   ```bash
   npm test
   ```
4. Server starten:
   ```bash
   npm start
   ```
   Anschließend läuft der Server auf Port **3000** unter [http://localhost:3000](http://localhost:3000). Beim ersten Start wird automatisch eine Datei `db.json` angelegt, in der die Keys dauerhaft gespeichert werden.

## Dashboard

Nach dem Start kann [http://localhost:3000/](http://localhost:3000/) im Browser
aufgerufen werden, um eine einfache HTML-Oberfläche für die REST-Endpunkte zu nutzen. Dort werden Listen aller freien und aller aktuell benutzten Keys angezeigt. Diese Daten stammen aus den Endpunkten `/keys/free/list` und `/keys/active/list`.
Das Layout verwendet eine eigene CSS-Datei `public/style.css`, die dem Dashboard ein modernes Erscheinungsbild verleiht.
Die Oberfläche ist in mehrere Tabs aufgeteilt. Jeder Tab blendet die zugehörigen Abschnitte ein oder aus. Die Listen der Keys sind nun als vertikale Liste umgesetzt.
Zu jedem Eintrag stehen Schaltflächen bereit, um den Key zu kopieren, zu löschen, freizugeben, als benutzt oder ungültig zu markieren sowie die Historie einzusehen.


Neu ist ein Button oben rechts, der zwischen hellem und dunklem Design umschaltet. Die Auswahl wird im Browser gespeichert, sodass das bevorzugte Design bei einem erneuten Besuch direkt aktiv ist. Die Farben werden weiterhin über CSS-Variablen angepasst.
Die Aktionsknöpfe in den Key-Listen werden nun als farbige Symbole dargestellt, was die Bedienung vereinfacht.
Beim Überfahren der Symbole erscheint ein kurzer Hinweis, der die jeweilige Aktion beschreibt.

Antworten des Servers erscheinen in kleinen Ergebnisboxen direkt unter den Formularen. Beim Abrufen eines freien Keys wird zusätzlich ein Kopieren-Button angeboten.

Zusätzlich gibt es nun in der Statistik einen Zähler für ungültige Keys.
Ebenfalls im Dashboard vorhanden sind Filterfelder für die Gesamtübersicht.
Mit einer Checkbox lassen sich nur aktuell benutzte Keys anzeigen. Über ein
Textfeld kann zudem nach dem Wert des Feldes `assignedTo` gefiltert werden.
Beim Klick auf **Laden** werden diese Angaben als Query-Parameter an den
Endpunkt `/keys` angehängt und das Ergebnis direkt angezeigt.

Außerdem steht ein Formular **Key freigeben** bereit. Mit Eingabe einer ID
schickt es einen PUT-Request auf `/keys/:id/release`, markiert den Key damit als
frei und zeigt die Antwort direkt unter dem Formular an.

Neu hinzugekommen ist ein weiteres Formular **Key löschen**, das eine
ID entgegennimmt und damit einen `DELETE`-Request auf `/keys/:id` ausführt.
Das Ergebnis wird ebenfalls im Dashboard angezeigt.

Ebenfalls verfügbar ist nun ein Formular **Key ungültig**, das eine ID annimmt
und per Button einen `PUT`-Request auf `/keys/:id/invalidate` sendet. Dadurch
wird der gewählte Key dauerhaft als unbrauchbar markiert. Die Serverantwort wird
unter dem Formular dargestellt.


## REST-Endpunkte

### GET `/keys`
Gibt eine Liste aller gespeicherten Keys zurück.

Optionale Query-Parameter erlauben das Filtern der Ausgabe:

- `inUse`: "true" oder "false" – gibt nur Keys zurück, die (nicht) in Benutzung sind
- `assignedTo`: Name einer Person – gibt nur Keys zurück, die dieser Person zugewiesen sind

Beide Parameter können kombiniert werden, z.B. `/keys?inUse=true&assignedTo=Max`.

Beispiele für einzelne Filteraufrufe:

- Nur benutzte Keys: `/keys?inUse=true`
- Nach Name filtern: `/keys?assignedTo=Lisa`

### POST `/keys`
Legt einen oder mehrere neue Keys an. Der Request-Body muss ein JSON-Objekt
sein. Es werden zwei Formate akzeptiert:

1. **Ein einzelner Key** im Feld `key`
2. **Mehrere Keys** als Array im Feld `keys`

Jeder Eintrag muss dem Muster `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` entsprechen.

Werden keine g\xC3\xBCltigen Keys \xFCbergeben, antwortet der Server mit Statuscode
`400`.

Beispiel f\xc3\bcr einen einzelnen Key:
```json
{ "key": "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE" }
```

Und f\xc3\bcr mehrere Keys:
```json
{ "keys": ["AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", "11111-22222-33333-44444-55555"] }
```

Damit lassen sich mehrere Keys in einem einzigen Request übermitteln. Die
Antwort enthält unabhängig vom Eingabeformat stets ein Array der erzeugten
Key-Objekte.
 
Bereits vorhandene Keys werden dabei ignoriert und nicht erneut gespeichert. Führt die Liste nur Duplikate oder ungültige Einträge, antwortet der Server mit Statuscode `400`.

### GET `/keys/free`
Gibt den ersten verfügbaren Key als reinen Text zurück (Muster `XXXXX-XXXXX-...`).
Der Antworttyp ist `text/plain`. Ist kein Key frei, lautet der Statuscode `404`.

### GET `/keys/free/list`
Gibt eine komplette Liste aller momentan freien Keys zurück. Die Antwort ist ein Array der entsprechenden Key-Objekte.

### GET `/keys/active/list`
Liefert alle Keys, die aktuell in Benutzung sind (`inUse=true`). Auch hier wird ein Array von Key-Objekten zurückgegeben.

### GET `/keys/:id/history`
Gibt die komplette Historie eines Keys zurück. Die Antwort ist ein Array mit Einträgen der Form `{ action, timestamp, assignedTo }`. Ist die ID unbekannt, antwortet der Server mit Statuscode `404`.

### PUT `/keys/:id/inuse`
Markiert einen Key als in Benutzung. Die ID wird in der URL angegeben. Im Request-Body kann ein Feld `assignedTo` übergeben werden, um zu notieren, wer den Key verwendet:
```json
{ "assignedTo": "Max" }
```
Die Antwort enthält das aktualisierte Key-Objekt. Bei unbekannter ID wird ein 404-Statuscode zurückgegeben.

### PUT `/keys/:id/release`
Setzt einen zuvor belegten Key wieder auf frei. `inUse` wird dabei auf `false` gesetzt und das Feld `assignedTo` geleert. In der History wird ein Eintrag mit der Aktion `release` und Zeitstempel gespeichert. Die Antwort enthält den aktualisierten Key.

### PUT `/keys/:id/invalidate`
Markiert einen bestehenden Key dauerhaft als ungültig. Ein so gekennzeichneter
Eintrag wird von `/keys/free` ignoriert und kann nicht mehr genutzt werden. Die
Antwort enthält das aktualisierte Key-Objekt mit dem Feld `invalid=true`.

### DELETE `/keys/:id`
Entfernt einen Key dauerhaft aus der Datenbank. Bei Erfolg wird `{ success: true }` zurückgegeben. Ist die ID unbekannt, lautet der Statuscode `404`.

## Datenstruktur

Die Daten werden in der Datei `db.json` gespeichert und sehen wie folgt aus:
```json
{
  "id": 1,
  "key": "XXXXX-XXXXX-XXXXX-XXXXX",
  "inUse": false,
  "assignedTo": null
}
```
Beim Start werden die gespeicherten Einträge geladen, sodass die Keys auch nach einem Neustart des Servers erhalten bleiben.

## Sicherheit

Dieses Projekt enthält keine Sicherheitsmechanismen, keine Authentifizierung und kein HTTPS. Der Fokus liegt allein auf den oben beschriebenen REST-Endpunkten.

## Logging

Wird der Server mit aktivierter Logger-Option gestartet (Standard bei `npm start`),
werden wichtige Aktionen protokolliert. Dazu gehören insbesondere das Abrufen
eines freien Keys, das Markieren als benutzt, das Freigeben sowie das Löschen
eines Eintrags. Die Log-Ausgaben erscheinen auf der Konsole und können zur
Nachverfolgung der Vorgänge genutzt werden.

Soll zusätzlich eine Logdatei geführt werden, kann beim Start ein Pfad
übergeben werden. Dieser wird als erstes Argument an `index.js` gereicht und
unter dem Optionsnamen `logFile` verwendet. Beispiel:

```bash
npm start -- ./server.log
```

Damit schreibt Pino alle Logeinträge in die angegebene Datei.

## Telegram-Benachrichtigung

Ist ein Bot-Token sowie eine Chat-ID hinterlegt, informiert der Server per
Telegram, sobald erstmals weniger als 20 freie Keys vorhanden sind. Fällt der
Bestand später unter zehn, wird ein weiteres Mal gewarnt. Diese Prüfung erfolgt
sowohl beim laufenden Betrieb als auch direkt beim Start des Servers. Dazu müssen folgende
Variablen gesetzt werden:

```bash
export TELEGRAM_BOT_TOKEN="<TOKEN>"
export TELEGRAM_CHAT_ID="<CHAT_ID>"
```

Die Warnungen werden nur einmal je Schwelle versendet, um wiederholte Meldungen
zu vermeiden. Steigt die Zahl freier Keys über zwanzig, beginnt die Zählung von
neuem.

## Tests

Um sicherzustellen, dass alle Funktionen weiterhin korrekt arbeiten, existieren Jest-Tests im Verzeichnis `__tests__`. Diese decken sämtliche REST-Endpunkte sowie das Dashboard ab. Die Ausführung inklusive Testabdeckung erfolgt mit:

```bash
npm test
```

Dabei werden alle Tests gestartet und die Ergebnisse sowie die Coverage im Terminal ausgegeben. Der erzeugte Coverage-Bericht findet sich anschließend im Ordner `coverage`. Für die Entwicklung kann der Watch-Modus genutzt werden:
```bash
npm test -- --watch
```
So werden die Tests nach jeder Dateiänderung automatisch erneut ausgeführt.
