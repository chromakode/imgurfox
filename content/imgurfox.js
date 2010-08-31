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
          let imageURI = ImgurFoxWindow.contextImageURI,
              showMenuItem = imageURI && imageURI.scheme == "http";
              imageMenuItems = document.getElementsByClassName("imgur-image-command");
        
        Array.prototype.forEach.call(imageMenuItems, function(menuitem) {
          menuitem.hidden = !showMenuItem;
        });
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
      Imgur.transload(ImgurFoxWindow.contextImageURI.spec, edit);
    },
    
    uploadScreenshot: function(event) {
      Imgur.upload(utils.dataFromURI(this.grabScreenshot()));
    },
    
    uploadSelectiveScreenshot: function(event) {
      this.grabSelectiveScreenshot(function(screenshotData) {
        Imgur.upload(utils.dataFromURI(screenshotData));
      });
    },
    
    /* Browser screenshot helpers */
    
    grabScreenshot: function(rect, fullPage) {
      let canvas = document.getElementById("imgurfox-canvas");
      let win = gBrowser.contentWindow;
      
      if (!rect) {
        rect = {};
        if (fullPage) {
          rect.x = 0;
          rect.y = 0;
          rect.w = win.document.documentElement.clientWidth;
          rect.h = win.document.documentElement.scrollHeight;
        } else {
          rect.x = win.scrollX;
          rect.y = win.scrollY;
          rect.w = win.innerWidth;
          rect.h = win.innerHeight;
        }
      }
      
      canvas.width = rect.w;
      canvas.height = rect.h;
      
      let ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, rect.w, rect.h);
      ctx.drawWindow(win, rect.x, rect.y, rect.w, rect.h, "rgb(255,255,255)");
      return canvas.toDataURL();
    },
    
    grabSelectiveScreenshot: function(callback) {
      var notificationValue = "imgurfox-selective-screenshot";
    
      function initBar(iframe) {
        let notificationBox = gBrowser.getNotificationBox();
        return notificationBox.appendNotification(
          stringBundle.GetStringFromName("selectiveScreenshot.message"),
          notificationValue, 
          "chrome://imgurfox/skin/upload_small.png",
          notificationBox.PRIORITY_INFO_HIGH,
          [{label:"Cancel", accessKey:"C", callback:function() { endCrop(iframe); }},
           {label:"Upload", accessKey:"U", callback:function() { performCrop(iframe); }}]);
      }
    
      function initCrop() {
        // Make an iframe on top of the page content.
        let pageDocument = gBrowser.contentDocument,
            pageDocumentHeight = pageDocument.documentElement.scrollHeight;
        let iframe = pageDocument.createElement("iframe");
        iframe.setAttribute("style", "position:absolute; top:0; left:0; width:100%; height:"+pageDocumentHeight+"px; border:none; background:none; overflow:hidden; z-index:999999;");
        pageDocument.body.appendChild(iframe);
        
        // Woot, let"s start piling scripts and css into it.
        iframe.addEventListener("load", function(event) {
          let iframeDocument = iframe.contentDocument;
          iframeDocument.body.setAttribute("style", "margin:0; width:100%; height:100%;");
          
          utils.addCSS(iframeDocument, "chrome://imgurfox-crop/content/jquery.Jcrop.css");
          utils.addScripts(iframeDocument,
            ["chrome://imgurfox-crop/content/jquery-1.4.2.min.js",
             "chrome://imgurfox-crop/content/jquery.Jcrop.js"],
            function afterLoaded() {
              // Run this code within the iframe.
              iframe.contentWindow.location.href = "javascript:(" + function() {
                function saveCoords(c) {
                  window.cropCoords = JSON.stringify(c);
                }
              
                var dde = window.top.document.documentElement,
                    crop = $.Jcrop(document.body, {
                      boundary: 0,
                      onChange: saveCoords,
                      onDblClick: function(c) {
                        saveCoords(c);
                        var event = document.createEvent("Events");
                        event.initEvent("CropFinished", true, false);
                        document.body.dispatchEvent(event);
                      }
                    });
                    
                $(".jcrop-holder").hide();
                
                crop.setSelect([
                  dde.scrollLeft + 50,
                  dde.scrollTop + 50,
                  dde.scrollLeft + dde.clientWidth - 50,
                  dde.scrollTop + dde.clientHeight - 50]);
                  
                crop.focus();
                crop.enable();
                $(".jcrop-holder").fadeIn();
                return;
              } + ")();";
            }
          );
        }, false);
        
        return iframe;
      }
      
      function endCrop(iframe) {
        iframe.parentNode.removeChild(iframe);
        
        var notification = gBrowser.getNotificationBox().getNotificationWithValue(notificationValue);
        if (notification) { notification.close(); }
      }
      
      function performCrop(iframe) {
        let cropCoords = nativeJSON.decode(iframe.contentWindow.wrappedJSObject.cropCoords);
        endCrop(iframe);
        let screenshotData = ImgurFoxWindow.grabScreenshot(cropCoords);
        callback(screenshotData);
      }
      
      let iframe = initCrop();
      iframe.contentWindow.addEventListener("CropFinished", function() { performCrop(iframe) }, false);
      initBar(iframe).addEventListener("click", function(event) {
        if (/messageCloseButton/.test(event.originalTarget.getAttribute("class"))) {
          endCrop(iframe);
        }
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
      let imageTab = gBrowser.loadOneTab("http://imgur.com/working/", null, null, null, false);
      req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      req.onreadystatechange = function (e) {
        if (req.readyState == 4) {
          if (req.status == 200) {
            data = nativeJSON.decode(req.responseText)
            if (data["rsp"]["stat"] == "ok") {
              gBrowser.getBrowserForTab(imageTab).loadURI(data["rsp"]["image"]["imgur_page"]);
            } else {
              dump("Imgur error: " + data["rsp"]["error_code"]);
              // FIXME
            }
          } else {
            // FIXME
          }
        }
      };
      req.send("image="+encodeURIComponent(base64data)+"&key="+encodeURIComponent(this.api_key));
    },
  }
  
  var utils = {
    setAttributes: function(el, attrs) { 
      attrs.forEach(function(attr) {
        el.setAttribute(attr[0], attr[1]);
      });
    },
    
    addScript: function(doc, src, callback) { 
      let el = doc.createElement("script");
      this.setAttributes(el, [["type", "text/javascript"], ["src", src]]);
      if (callback) { el.addEventListener("load", callback, false); }
      doc.getElementsByTagName("head")[0].appendChild(el);
      return el;
    },
    
    addScripts: function(doc, scripts, callback) {
      if (scripts.length > 0) {
        this.addScript(doc, scripts.shift(), function() {
          utils.addScripts(doc, scripts, callback);
        });
      } else {
        if (callback) { callback(); }
      }
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
