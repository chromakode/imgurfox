var ImgurFoxWindow = (function() {
  let extension = Application.extensions.get("imgurfox@imgur.com");
  let stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                               .getService(Components.interfaces.nsIStringBundleService)
                               .createBundle("chrome://imgurfox/locale/imgurfox.properties");
  let nativeJSON = Components.classes["@mozilla.org/dom/json;1"]
                             .createInstance(Components.interfaces.nsIJSON);
  
  let imageFileReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  let IMGUR_API_KEY = "24bf6070f45ed716e8cf9324baebddbd";
  
  let CONTEXT_CHOICE = 0;
  let CONTEXT_UPLOAD = 1;
  let CONTEXT_EDIT   = 2;
  
  function uploadURL(imgSrc) {
    return "http://imgur.com/api/upload?url=" + imgSrc;
  }
  
  function editURL(imgSrc) {
    return "http://imgur.com/api/upload?edit&url=" + imgSrc;
  }
  
  let uploadPOSTURL = "http://imgur.com/api/upload.json";

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
    
    grabScreenshot: function() {
      let canvas = document.getElementById("imgurfox-canvas");
      let win = gBrowser.contentWindow;
      let x = win.scrollX;
      let y = win.scrollY;
      let w = win.document.width;
      let h = win.innerHeight; 
      
      canvas.width = w;
      canvas.height = h;
      
      let ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawWindow(win, x, y, w, h, "rgb(255,255,255)");
      return canvas.toDataURL();
    },
    
    screenshotUpload: function(event) {
      let dataURL = this.grabScreenshot();
      let base64data = dataURL.replace(/^([^,])*,/, "");
  
      let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
      req.open("POST", uploadPOSTURL, true);
      req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      req.onreadystatechange = function (e) {
        if (req.readyState == 4) {
          if (req.status == 200) {
            data = nativeJSON.decode(req.responseText)
            if (data["rsp"]["stat"] == "ok") {
              openUILinkIn(data["rsp"]["image"]["imgur_page"], "tab");
            } else {
              dump("Imgur error: " + data["rsp"]["error_code"]);
              // FIXME
            }
          } else {
            // FIXME
          }
        }
      };
      req.onprogress = function onProgress(e) {  
        let percentComplete = (e.position / e.totalSize)*100;
        dump(percentComplete);
      }
      req.send('image='+encodeURIComponent(base64data)+'&key='+encodeURIComponent(IMGUR_API_KEY));
    },

  }
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
