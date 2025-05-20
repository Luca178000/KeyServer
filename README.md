# KeyServer

Ein einfacher Fastify-Server, der Windows-Keys in einer In-Memory-Liste verwaltet. 

## Installation

1. Stelle sicher, dass Node.js (Version 14 oder höher) installiert ist.
2. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. Server starten:
   ```bash
   npm start
   ```
   Der Server läuft anschließend auf Port **3000**.

## Dashboard

Nach dem Start kann [http://localhost:3000/](http://localhost:3000/) im Browser
aufgerufen werden, um eine einfache HTML-Oberfläche für die REST-Endpunkte zu
nutzen. Dort werden nun zusätzlich Listen aller freien und aller aktuell
benutzten Keys angezeigt. Diese Daten stammen aus den neuen Endpunkten
`/keys/free/list` und `/keys/active/list`.


## REST-Endpunkte

### GET `/keys`
Gibt eine Liste aller gespeicherten Keys zurück.

Optionale Query-Parameter erlauben das Filtern der Ausgabe:

- `inUse`: "true" oder "false" – gibt nur Keys zurück, die (nicht) in Benutzung sind
- `assignedTo`: Name einer Person – gibt nur Keys zurück, die dieser Person zugewiesen sind

Beide Parameter können kombiniert werden, z.B. `/keys?inUse=true&assignedTo=Max`.

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

Damit lassen sich mehrere Keys in einem einzigen Request \u00fcbermitteln. Die
Antwort enth\u00e4lt unabh\u00e4ngig vom Eingabeformat stets ein Array der erzeugten
Key-Objekte.

### GET `/keys/free`
Liefert den ersten verfügbaren Key (ein Key mit `inUse=false` und `invalid=false`). Gibt einen 404-Statuscode zurück, wenn keiner verfügbar ist.

### GET `/keys/free/list`
Gibt eine komplette Liste aller momentan freien Keys zurück. Die Antwort ist ein Array der entsprechenden Key-Objekte.

### GET `/keys/active/list`
Liefert alle Keys, die aktuell in Benutzung sind (`inUse=true`). Auch hier wird ein Array von Key-Objekten zurückgegeben.

### PUT `/keys/:id/inuse`
Markiert einen Key als in Benutzung. Die ID wird in der URL angegeben. Im Request-Body kann ein Feld `assignedTo` übergeben werden, um zu notieren, wer den Key verwendet:
```json
{ "assignedTo": "Max" }
```
Die Antwort enthält das aktualisierte Key-Objekt. Bei unbekannter ID wird ein 404-Statuscode zurückgegeben.

### PUT `/keys/:id/release`
Setzt einen zuvor belegten Key wieder auf frei. `inUse` wird dabei auf `false` gesetzt und das Feld `assignedTo` geleert. In der History wird ein Eintrag mit der Aktion `release` und Zeitstempel gespeichert. Die Antwort enthält den aktualisierten Key.

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

## Tests

Um sicherzustellen, dass alle Funktionen weiterhin korrekt arbeiten, existieren Jest-Tests im Verzeichnis __tests__. Die Ausführung erfolgt mit:

```bash
npm test
```

Dabei werden sämtliche Tests gestartet und die Ergebnisse im Terminal ausgegeben.
