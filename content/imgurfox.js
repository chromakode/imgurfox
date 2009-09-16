var ImgurFoxWindow = (function() {
  let extension = Application.extensions.get("imgurfox@imgur.com");
  let stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                               .getService(Components.interfaces.nsIStringBundleService)
                               .createBundle("chrome://imgurfox/locale/imgurfox.properties");
  
  let imageFileReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  CONTEXT_CHOICE = 0;
  CONTEXT_UPLOAD = 1;
  CONTEXT_EDIT   = 2;
  
  function uploadURL(imgSrc) {
    return "http://imgur.com/api/upload?url=" + imgSrc;
  }
  
  function editURL(imgSrc) {
    return "http://imgur.com/api/upload?edit&url=" + imgSrc;
  }

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
      window.addEventListener("unload", ImgurFoxWindow.onUnload, false);
    },
    
    get contextImageURI() {
      if (gContextMenu.onImage) {
        // Right clicked on an image
        return gContextMenu.target.currentURI;
      } else if (gContextMenu.onLink && imageFileReg.test(gContextMenu.linkURL)) {
        // Right clicked on a link to an image
        return gContextMenu.linkURI;
      }
      return false;
    },
    
    onLoad: function() {
      let contextMenu = document.getElementById("contentAreaContextMenu");
      contextMenu.addEventListener("popupshowing", function(event) {
        let uploadMenuItem = document.getElementById("context-imgur");
        let uploadMenuChoice = document.getElementById("context-imgur-choice");
        
        let showMenuItem;
        let imageURI = ImgurFoxWindow.contextImageURI;
        if (imageURI) {
          // TODO: Can imgur take https or ftp URL schemes?
          showMenuItem = imageURI.scheme == "http";
        } else {
          showMenuItem = false;
        }
        
        if (showMenuItem) {
          let contextAction = extension.prefs.get("defaultContextAction").value;
          let isChoice = contextAction == CONTEXT_CHOICE;
          
          uploadMenuItem.hidden = isChoice;
          uploadMenuChoice.hidden = !isChoice;
          
          if (!isChoice) {
            if (contextAction == CONTEXT_UPLOAD) {
                uploadMenuItem.label = stringBundle.GetStringFromName("uploadImageCmd.label");
            } else {
                uploadMenuItem.label = stringBundle.GetStringFromName("editImageCmd.label");
            }
          }
        } else {
          uploadMenuItem.hidden = true;
          uploadMenuChoice.hidden = true;
        }
      }, false)
    },
    
    onUnload: function() {
      // :(
    },
    
    contextUpload: function(event, edit) {
      if (edit == null) {
        edit = extension.prefs.get("defaultContextAction").value == CONTEXT_EDIT;
      }
      let actionURL = edit ? editURL : uploadURL;
      openUILinkIn(actionURL(ImgurFoxWindow.contextImageURI.spec), "tab");
    },

  }
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
