var ImgurFoxWindow = (function() {
  let preferences = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService)
                    .getBranch("extensions.imgurfox@imgur.com.");
  let stringBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                               .getService(Components.interfaces.nsIStringBundleService)
                               .createBundle("chrome://imgurfox/locale/imgurfox.properties");
  let nativeJSON = Components.classes["@mozilla.org/dom/json;1"]
                             .createInstance(Components.interfaces.nsIJSON);
  
  let imageFileReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  let CONTEXT_CHOICE = 0;
  let CONTEXT_UPLOAD = 1;
  let CONTEXT_EDIT   = 2;

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
      window.addEventListener("unload", ImgurFoxWindow.onUnload, false);
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
          let contextAction = preferences.getCharPref("defaultContextAction");
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
    
    /* User command handlers */
    
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
    
    uploadImage: function(event, edit) {
      if (edit == null) {
        edit = preferences.getCharPref("defaultContextAction") == CONTEXT_EDIT;
      }
      let actionURL = edit ? editURL : uploadURL;
      Imgur.transload(ImgurFoxWindow.contextImageURI.spec);
    },
    
    uploadScreenshot: function(event) {
        Imgur.upload(dataFromURI(this.grabScreenshot()));
    },
    
    uploadSelectiveScreenshot: function(event) {
      this.grabSelectiveScreenshot();
    },
    
    /* Browser screenshot helpers */
    
    grabScreenshot: function(fullPage) {
      let canvas = document.getElementById("imgurfox-canvas");
      let win = gBrowser.contentWindow;
      
      let x, y, w, h;
      if (fullPage) {
        x = 0;
        y = 0;
        w = win.document.documentElement.clientWidth;
        h = win.document.documentElement.scrollHeight;
      } else {
        x = win.scrollX;
        y = win.scrollY;
        w = win.document.documentElement.width;
        h = win.innerHeight;
      }
      
      canvas.width = w;
      canvas.height = h;
      
      let ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawWindow(win, x, y, w, h, "rgb(255,255,255)");
      return canvas.toDataURL();
    },
    
    grabSelectiveScreenshot: function() {
      let screenshot = this.grabScreenshot(true);
      
      // Make an iframe on top of the page content.
      let pageDocument = gBrowser.contentDocument,
          pageDocumentHeight = pageDocument.documentElement.scrollHeight;
      let iframe = pageDocument.createElement("iframe");
      iframe.setAttribute("style", "position:absolute; top:0; left:0; width:100%; height:"+pageDocumentHeight+"px; border:none; background:none; overflow:hidden; z-index:999999;");
      pageDocument.body.appendChild(iframe);
      
      // Woot, let"s start piling scripts and css into it.
      iframe.addEventListener("load", function(event) {
        let iframeDocument = iframe.contentDocument;
        
        iframeDocument.body.setAttribute("style", "margin:0;");
        
        utils.addScript(iframeDocument, "chrome://imgurfox-crop/content/jquery-1.4.2.min.js")
        utils.addScript(iframeDocument, "chrome://imgurfox-crop/content/jquery.Jcrop.js");
        utils.addCSS(iframeDocument, "chrome://imgurfox-crop/content/jquery.Jcrop.css");

        let imgScreenshot = iframeDocument.createElement("img");
        imgScreenshot.setAttribute("id", "screenshot");
        imgScreenshot.setAttribute("src", screenshot);
        iframeDocument.body.appendChild(imgScreenshot);

        //let scrollTop = iframeDocument.documentElement.scrollTop;
        iframe.contentWindow.location = "javascript:(function() { var dde = window.top.document.documentElement, crop = $.Jcrop('#screenshot', {boundary:0}); $('.jcrop-holder').hide(); crop.setSelect([dde.scrollLeft + 10, dde.scrollTop + 10, dde.scrollLeft + dde.clientWidth - 10, dde.scrollTop + dde.clientHeight - 10]); crop.focus(); crop.enable(); $('.jcrop-holder').fadeIn(); return; }());";
        //iframeDocument.documentElement.scrollTop = scrollTop;
      }, false);
    },
  }
  
  var Imgur = {
    api_key: "24bf6070f45ed716e8cf9324baebddbd",
    
    transload: function(src, edit) {
      openUILinkIn("http://imgur.com/api/upload?"+(edit ? "edit&" : "")+"url="+src, "tab");
    },
  
    upload: function(base64data) {
      let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
      req.open("POST", "http://imgur.com/api/upload.json", true);
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
      req.send("image="+encodeURIComponent(base64data)+"&key="+encodeURIComponent(this.api_key));
    },
  }
  
  var utils = {
    setAttributes: function(el, attrs) { 
      attrs.forEach(function(attr) {
        el.setAttribute(attr[0], attr[1]);
      });
    },
    
    addScript: function(doc, src) { 
      let el = doc.createElement("script");
      this.setAttributes(el, [["type", "text/javascript"], ["src", src]]);
      doc.getElementsByTagName("head")[0].appendChild(el);
      return el;
    },
    
    addCSS: function(doc, src) {
      let el = doc.createElement("link");
      this.setAttributes(el, [["type", "text/css"], ["rel", "stylesheet"], ["href", src]]);
      doc.getElementsByTagName("head")[0].appendChild(el);
      return el;
    },
    
    dataFromURI: function(dataURI) {
      return dataURI.replace(/^([^,])*,/, "");
    }
  }
  
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
