var ImgurFoxWindow = (function() {
  let modules = {};
  let importModule = function(name) Components.utils.import(name, modules);
  
  let extensionReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  function uploadURL(imgSrc) {
    return "http://imgur.com/api/upload/?url=" + imgSrc;
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
            let imageURI = null;
            if (gContextMenu.onImage) {
                // Right clicked on an image
                imageURI = gContextMenu.target.currentURI;
            } else if (gContextMenu.onLink && extensionReg.test(gContextMenu.linkURL)) {
                // Right clicked on a link to an image
                imageURI = gContextMenu.linkURI;
            }
            
            if (imageURI) {
                // TODO: Can imgur take https or ftp URL schemes?
                schemeOk = imageURI.scheme == "http";
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
        if (gContextMenu.onImage)
          openUILinkIn(uploadURL(gContextMenu.imageURL), "tab");
        else if (gContextMenu.onLink)
          openUILinkIn(uploadURL(gContextMenu.linkURL), "tab");
    },

  }
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
