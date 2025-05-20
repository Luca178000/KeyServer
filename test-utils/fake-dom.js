const vm = require('vm');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.title = '';
    this.children = [];
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? this[name]; }
  appendChild(child) { this.children.push(child); }
  addEventListener() {}
}

class Document {
  constructor() {
    this.nodes = {};
  }

  /**
   * Erzeugt ein neues Element des angegebenen Typs.
   * In dieser sehr einfachen DOM-Implementierung werden nur wenige
   * Eigenschaften unterst\u00fctzt.
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
   * Vereinfache Auswahl von Elementen per CSS-Selektor.
   * F\u00fcr die Tests reicht es aus, ein Objekt mit einer leeren click-Methode
   * zur\u00fcckzugeben.
   */
  querySelector() {
    return { click() {} };
  }

  querySelectorAll() {
    return [];
  }

  addEventListener() {}
}

class JSDOM {
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
