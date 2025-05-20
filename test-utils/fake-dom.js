const vm = require('vm');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.textContent = '';
    this.className = '';
    this.title = '';
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? this[name]; }
  appendChild() {}
  addEventListener() {}
}

class Document {
  createElement(tag) { return new Element(tag); }
}

class JSDOM {
  constructor(html, options = {}) {
    this.window = { document: new Document() };
    if (options.runScripts === 'dangerously') {
      const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (match) {
        const funcMatch = match[1].match(/function createActionButton[\s\S]*?return btn;\s*}/);
        if (funcMatch) vm.runInNewContext(funcMatch[0], this.window);
      }
    }
  }
}

module.exports = { JSDOM };
