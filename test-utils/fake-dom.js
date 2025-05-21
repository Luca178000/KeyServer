const vm = require('vm');

/**
 * Sehr einfaches DOM-Element f\u00fcr die Tests.
 * Stellt nur die Eigenschaften bereit, die in den Skripten genutzt werden.
 */
class Element {
  /**
   * Legt ein Element mit dem gegebenen Tag an.
   */
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.title = '';
    this.children = [];
    // Speichert hinterlegte Event-Handler
    this.listeners = {};
    // Einfache Umsetzung von classList 
    this.classList = {
      _c: new Set(),
      add: (...n) => n.forEach((c) => this.classList._c.add(c)),
      remove: (...n) => n.forEach((c) => this.classList._c.delete(c)),
      contains: (n) => this.classList._c.has(n),
      toggle: (n) => {
        if (this.classList._c.has(n)) this.classList._c.delete(n);
        else this.classList._c.add(n);
      }
    };
  }

  /**
   * Hinterlegt ein Attribut am Element.
   */
  setAttribute(name, value) { this.attributes[name] = value; }

  /**
   * Liefert den gespeicherten Attributwert zur\u00fcck.
   */
  getAttribute(name) { return this.attributes[name] ?? this[name]; }

  /**
   * F\u00fcgt ein Kindelement hinzu.
   */
  appendChild(child) { this.children.push(child); }

  /**
   * Nimmt mehrere Kindelemente entgegen und fügt sie an.
   */
  append(...kids) { this.children.push(...kids); }

  /**
   * Platzhalter f\u00fcr Event-Listener, wird in den Tests nicht ben\u00f6tigt.
   */
  addEventListener(type, fn) { this.listeners[type] = fn; }
}

/**
 * Minimaler Ersatz f\u00fcr `document` im Browser.
 */
class Document {
  /**
   * Initialisiert die interne Sammlung f\u00fcr Elemente mit IDs.
   */
  constructor() {
    this.nodes = {};
    this.body = new Element('body');
    this.listeners = {};
  }

  /**
   * Erzeugt ein neues Element des angegebenen Typs.
   * Unterst\u00fctzt nur die Funktionen, die f\u00fcr die Tests erforderlich sind.
   */
  createElement(tag) {
    return new Element(tag);
  }

  /**
   * Liefert ein Element mit der angegebenen ID zur\u00fcck.
   * Existiert es noch nicht, wird ein neues generisches Element erzeugt.
   */
  getElementById(id) {
    if (!this.nodes[id]) this.nodes[id] = new Element('div');
    return this.nodes[id];
  }

  /**
   * Vereinfacht die Auswahl per CSS-Selektor.
   * Gibt f\u00fcr die Tests lediglich ein Objekt mit leerer click-Methode zur\u00fcck.
   */
  querySelector() {
    return { click() {} };
  }

  /**
   * Gibt immer eine leere Liste zur\u00fcck, da komplexe Selektoren nicht ben\u00f6tigt werden.
   */
  querySelectorAll() {
    return [];
  }

  /**
   * Speichert Event-Handler, um sie sp\u00e4ter ausf\u00fchren zu k\u00f6nnen.
   */
  addEventListener(type, fn) { this.listeners[type] = fn; }
}

/**
 * Stellt eine minimale DOM-Umgebung zur Verf\u00fcgung,
 * damit im Test HTML und Skripte ausgef\u00fchrt werden k\u00f6nnen.
 */
class JSDOM {
  /**
   * Erstellt die Umgebung und f\u00fchrt optional enthaltene Skripte aus.
   */
  constructor(html, options = {}) {
    // Minimale Objekte f\u00fcr globale Funktionen im Browser
    this.window = {
      document: new Document(),
      navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
      localStorage: {
        _s: {},
        getItem(k) { return this._s[k]; },
        setItem(k, v) { this._s[k] = v; }
      }
    };

    if (options.runScripts === 'dangerously') {
      const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (match) {
        // F\u00fchrt das komplette Skript im Kontext des Browser-Ersatzes aus
        vm.runInNewContext(match[1], this.window);
      }
    }
  }
}

module.exports = { JSDOM };
