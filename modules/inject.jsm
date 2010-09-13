var EXPORTED_SYMBOLS = ["Inject"];

var Inject = {
  setAttributes: function(el, attrs) {
    attrs.forEach(function(attr) {
      el.setAttribute(attr[0], attr[1]);
    });
  },
  
  script: function(doc, src, callback) {
    let el = doc.createElement("script");
    Inject.setAttributes(el, [["type", "text/javascript"], ["src", src]]);
    if (callback) { el.addEventListener("load", callback, false); }
    doc.getElementsByTagName("head")[0].appendChild(el);
    return el;
  },
  
  scripts: function(doc, scripts, callback) {
    if (scripts.length > 0) {
      Inject.script(doc, scripts.shift(), function() {
        Inject.scripts(doc, scripts, callback);
      });
    } else {
      if (callback) { callback(); }
    }
  },
  
  css: function(doc, src) {
    let el = doc.createElement("link");
    Inject.setAttributes(el, [["type", "text/css"], ["rel", "stylesheet"], ["href", src]]);
    doc.getElementsByTagName("head")[0].appendChild(el);
    return el;
  }
};
