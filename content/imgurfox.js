var ImgurFoxWindow = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);

  function uploadURL(imgSrc) {
    return "http://imgur.com/api/upload/?url=" + imgSrc
  }

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
      window.addEventListener("unload", ImgurFoxWindow.onUnload, false);
    },
    
    onLoad: function() {
        let contextMenu = document.getElementById("contentAreaContextMenu");
        let uploadMenuItem = document.getElementById("context-imgur");
        contextMenu.addEventListener("popupshowing", function(event) {
            // FIXME: Can imgur take https URLs?
            let schemeOk = gContextMenu.target.currentURI.scheme == "http";
            uploadMenuItem.hidden = !(gContextMenu.onImage && schemeOk);
        }, false)
    },
    
    onUnload: function() {
        // :(
    },
    
    contextUpload: function(event) {
        openUILinkIn(uploadURL(gContextMenu.imageURL), "tab");
    },

  }
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
