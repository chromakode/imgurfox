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
            if (gContextMenu.onImage) {
                // TODO: Can imgur take https or ftp URL schemes?
                let schemeOk = gContextMenu.target.currentURI.scheme == "http"
                uploadMenuItem.hidden = !schemeOk;
            } else {
                uploadMenuItem.hidden = true;
            }
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
