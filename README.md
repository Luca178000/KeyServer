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

## REST-Endpunkte

### GET `/keys`
Gibt eine Liste aller gespeicherten Keys zurück.

### POST `/keys`
Fügt einen neuen Key hinzu. Der Key wird im Request-Body als JSON übergeben:
```json
{ "key": "XXXXX-XXXXX-XXXXX-XXXXX" }
```
Antwort ist das neu erstellte Key-Objekt mit ID.

### GET `/keys/free`
Liefert den ersten verfügbaren Key (also einen Key mit `inUse=false`). Gibt einen 404-Statuscode zurück, wenn keiner verfügbar ist.

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
