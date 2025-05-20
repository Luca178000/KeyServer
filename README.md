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
nutzen.


## REST-Endpunkte

### GET `/keys`
Gibt eine Liste aller gespeicherten Keys zurück.

Optionale Query-Parameter erlauben das Filtern der Ausgabe:

- `inUse`: "true" oder "false" – gibt nur Keys zurück, die (nicht) in Benutzung sind
- `assignedTo`: Name einer Person – gibt nur Keys zurück, die dieser Person zugewiesen sind

Beide Parameter können kombiniert werden, z.B. `/keys?inUse=true&assignedTo=Max`.

### POST `/keys`
Fügt einen neuen Key hinzu. Der Key wird im Request-Body als JSON übergeben:
```json
{ "key": "XXXXX-XXXXX-XXXXX-XXXXX" }
```
Antwort ist das neu erstellte Key-Objekt mit ID.

### GET `/keys/free`
Liefert den ersten verfügbaren Key (ein Key mit `inUse=false` und `invalid=false`). Gibt einen 404-Statuscode zurück, wenn keiner verfügbar ist.

### PUT `/keys/:id/inuse`
Markiert einen Key als in Benutzung. Die ID wird in der URL angegeben. Im Request-Body kann ein Feld `assignedTo` übergeben werden, um zu notieren, wer den Key verwendet:
```json
{ "assignedTo": "Max" }
```
Die Antwort enthält das aktualisierte Key-Objekt. Bei unbekannter ID wird ein 404-Statuscode zurückgegeben.

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
